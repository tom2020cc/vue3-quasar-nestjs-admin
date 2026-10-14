import { uniqueTitles } from './unique-titles'
import { BadRequestException, Injectable } from '@nestjs/common'
import { createHash, createHmac, randomBytes, randomUUID } from 'crypto'
import { createReadStream, createWriteStream, existsSync } from 'fs'
import { lstat, mkdir, readdir, realpath, rename, stat, unlink } from 'fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'path'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'

const extensions = new Set(['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v', '.flv'])

@Injectable()
export class FolderVideoService {
  // Source videos are private local files, never a static HTTP directory.
  private readonly backendRoot = process.cwd()
  private readonly root = resolve(this.backendRoot, '..', 'static')
  private readonly key = randomBytes(32)

  private async checkedPath(input: string, directory: boolean) {
    if (typeof input !== 'string' || input.includes('\0') || isAbsolute(input) || input.includes('\\') || input.split('/').some(p => p === '..' || p === '.')) {
      throw new BadRequestException('请选择 static 内的相对路径')
    }
    await mkdir(this.root, { recursive: true })
    const root = await realpath(this.root)
    // Reject links at every level, including a linked static directory.
    if ((await lstat(this.root)).isSymbolicLink()) throw new BadRequestException('static 不能是链接目录')
    let path = this.root
    try {
      for (const part of input.split('/').filter(Boolean)) {
        path = join(path, part)
        if ((await lstat(path)).isSymbolicLink()) throw new Error('link')
      }
      path = await realpath(path)
      const rel = relative(root, path)
      if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error('outside')
      const info = await stat(path)
      if (directory ? !info.isDirectory() : !info.isFile()) throw new Error('type')
      return { path, info }
    } catch { throw new BadRequestException('文件或文件夹不存在，或包含不允许的链接') }
  }

  private signature(owner: number, file: string, size: number, modified: number) {
    return createHmac('sha256', this.key).update(JSON.stringify([owner, file, size, modified])).digest('hex')
  }

  async scan(owner: number, folder = '') {
    const { path } = await this.checkedPath(folder, true)
    const entries = await readdir(path, { withFileTypes: true })
    const folders: { name: string; path: string }[] = []
    const videos: { name: string; path: string; title: string; size: number; fingerprint: string; ticket: string; error: string }[] = []
    let ignored = 0
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))) {
      const child = [folder, entry.name].filter(Boolean).join('/')
      if (entry.isSymbolicLink()) { ignored++; continue }
      if (entry.isDirectory()) { folders.push({ name: entry.name, path: child }); continue }
      if (!entry.isFile() || !extensions.has(extname(entry.name).toLowerCase())) { ignored++; continue }
      const info = await stat(join(path, entry.name))
      const title = basename(entry.name, extname(entry.name))
      const error = info.size <= 0 ? '空文件' : !title.trim() || title.length > 100 || /[<>]/.test(title) ? '文件名作为标题须为 1–100 字符，且不含 < >，请重命名后扫描' : ''
      videos.push({ name: entry.name, path: child, title, size: info.size, fingerprint: `${info.size}:${info.mtimeMs}`, ticket: this.signature(owner, child, info.size, info.mtimeMs), error })
    }
    const titles = uniqueTitles(videos.map(v => v.title))
    videos.forEach((video, index) => { video.title = titles[index] })
    return { folder, playlistTitle: basename(path).trim(), folders, videos, ignored }
  }

  async importVideo(owner: number, file: string, ticket: string) {
    const { path, info } = await this.checkedPath(file, false)
    if (!extensions.has(extname(path).toLowerCase()) || info.size <= 0) throw new BadRequestException('请选择支持格式的非空视频文件')
    if (typeof ticket !== 'string' || ticket !== this.signature(owner, file, info.size, info.mtimeMs)) throw new BadRequestException('文件已变化或扫描已过期，请重新扫描')
    const destination = join(this.backendRoot, 'uploads', 'videos')
    await mkdir(destination, { recursive: true })
    const temporary = join(destination, `${randomUUID()}.part`)
    const hash = createHash('sha256')
    let bytes = 0
    try {
      await pipeline(createReadStream(path), new Transform({ transform(chunk, _encoding, done) {
        bytes += chunk.length
        if (bytes > info.size) return done(new Error('文件大小已变化，请重新扫描'))
        hash.update(chunk)
        done(null, chunk)
      } }), createWriteStream(temporary, { flags: 'wx' }))
      const after = await stat(path)
      if (bytes !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs) throw new BadRequestException('文件正在修改，请复制完成后重新扫描')
      const digest = hash.digest('hex')
      const filename = `folder-${digest}${extname(path).toLowerCase()}`
      if (existsSync(join(destination, filename))) await unlink(temporary)
      else await rename(temporary, join(destination, filename))
      return { filename, url: `/uploads/videos/${filename}`, size: bytes, hash: digest }
    } finally { await unlink(temporary).catch(() => undefined) }
  }
}
