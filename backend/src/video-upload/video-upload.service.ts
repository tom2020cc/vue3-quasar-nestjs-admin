import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { createHash, randomUUID } from 'crypto'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

export const CHUNK_SIZE = 5 * 1024 * 1024
export function guessMime(filename: string): string {
  const map = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.m4v': 'video/x-m4v', '.flv': 'video/x-flv' }
  return map[extname(filename).toLowerCase()] || 'video/mp4'
}
export function randomVideoName(ext: string): string { return `${Date.now()}-${randomUUID()}${ext}` }
export interface UploadResult { filename: string; url: string; size: number; hash: string; mimetype: string }
export interface UploadManifest {
  uploadId: string; fileName: string; fileSize: number; chunkHashes: string[]; result?: UploadResult
}

@Injectable()
export class VideoUploadService {
  // Sessions are private, outside the static /uploads directory; owner namespacing isolates users.
  private root = process.cwd()
  private merges = new Map<string, Promise<UploadResult>>()
  private directory(owner: number, id: string) {
    if (!Number.isSafeInteger(owner) || owner < 1 || !/^[a-f0-9]{64}$/.test(id || '')) throw new BadRequestException('上传标识无效')
    return join(this.root, '.upload-sessions', String(owner), id)
  }
  private read(owner: number, id: string): UploadManifest {
    const path = join(this.directory(owner, id), 'manifest.json')
    if (!existsSync(path)) throw new NotFoundException('请先初始化上传')
    return JSON.parse(readFileSync(path, 'utf8'))
  }
  private save(dir: string, value: UploadManifest) {
    const temp = join(dir, `manifest-${randomUUID()}.tmp`)
    writeFileSync(temp, JSON.stringify(value))
    renameSync(temp, join(dir, 'manifest.json'))
  }
  initialize(owner: number, input: UploadManifest) {
    if (!input || typeof input.fileName !== 'string' || !input.fileName.trim() || input.fileName.length > 255 ||
        !Number.isSafeInteger(input.fileSize) || input.fileSize <= 0 ||
        !Array.isArray(input.chunkHashes) || input.chunkHashes.length !== Math.ceil(input.fileSize / CHUNK_SIZE) ||
        input.chunkHashes.some(h => typeof h !== 'string' || !/^[a-f0-9]{64}$/.test(h))) throw new BadRequestException('文件无效，请选择非空视频并检查分片信息')
    const expectedId = createHash('sha256').update(input.chunkHashes.join('')).digest('hex')
    if (expectedId !== input.uploadId) throw new BadRequestException('文件指纹不匹配')
    const dir = this.directory(owner, input.uploadId)
    mkdirSync(dir, { recursive: true })
    if (existsSync(join(dir, 'manifest.json'))) {
      const old = this.read(owner, input.uploadId)
      if (old.fileSize !== input.fileSize) throw new ConflictException('文件大小不匹配')
    } else {
      this.save(dir, { uploadId: input.uploadId, fileName: input.fileName, fileSize: input.fileSize, chunkHashes: input.chunkHashes })
    }
    return this.status(owner, input.uploadId)
  }
  status(owner: number, id: string) {
    const manifest = this.read(owner, id)
    const dir = this.directory(owner, id)
    if (manifest.result && existsSync(join(this.root, 'uploads', 'videos', manifest.result.filename))) {
      return { uploaded: manifest.chunkHashes.map((_, i) => i), result: manifest.result }
    }
    const uploaded: number[] = []
    for (let i = 0; i < manifest.chunkHashes.length; i++) {
      const path = join(dir, `chunk_${i}`)
      if (existsSync(path) && statSync(path).size === Math.min(CHUNK_SIZE, manifest.fileSize - i * CHUNK_SIZE) &&
          createHash('sha256').update(readFileSync(path)).digest('hex') === manifest.chunkHashes[i]) uploaded.push(i)
    }
    return { uploaded, result: undefined as UploadResult | undefined }
  }
  commitChunk(owner: number, id: string, index: number, buffer: Buffer) {
    const manifest = this.read(owner, id)
    const dir = this.directory(owner, id)
    if (this.merges.has(dir)) throw new ConflictException('正在合并，请稍后重试')
    if (!Number.isSafeInteger(index) || index < 0 || index >= manifest.chunkHashes.length || !buffer ||
        buffer.length !== Math.min(CHUNK_SIZE, manifest.fileSize - index * CHUNK_SIZE) ||
        createHash('sha256').update(buffer).digest('hex') !== manifest.chunkHashes[index]) throw new BadRequestException('分片大小或校验值不匹配，请重传')
    // Multer has fully received the bounded chunk before this atomic commit; partial requests never count.
    const temporary = join(dir, `chunk-${randomUUID()}.tmp`)
    writeFileSync(temporary, buffer)
    renameSync(temporary, join(dir, `chunk_${index}`))
    return { uploadId: id, chunkIndex: index }
  }
  async merge(owner: number, id: string): Promise<UploadResult> {
    const dir = this.directory(owner, id)
    const running = this.merges.get(dir)
    if (running) return running
    const work = this.mergeOnce(owner, id)
    this.merges.set(dir, work)
    try { return await work } finally { this.merges.delete(dir) }
  }
  private async mergeOnce(owner: number, id: string): Promise<UploadResult> {
    const manifest = this.read(owner, id)
    const status = this.status(owner, id)
    if (status.result) return status.result // Retrying a lost merge response returns the same file.
    if (status.uploaded.length !== manifest.chunkHashes.length) throw new BadRequestException('分片不完整或损坏，请继续上传')
    const dir = this.directory(owner, id)
    const videoDir = join(this.root, 'uploads', 'videos')
    mkdirSync(videoDir, { recursive: true })
    const extension = extname(manifest.fileName).toLowerCase()
    const filename = randomVideoName(/^\.(mp4|mov|webm|mkv|avi|m4v|flv)$/.test(extension) ? extension : '.mp4')
    const finalPath = join(videoDir, filename)
    const temporary = join(dir, 'merged.tmp')
    const hash = createHash('sha256')
    async function* chunks() {
      for (let i = 0; i < manifest.chunkHashes.length; i++) {
        const buffer = readFileSync(join(dir, `chunk_${i}`))
        hash.update(buffer)
        yield buffer
      }
    }
    try {
      await pipeline(Readable.from(chunks()), createWriteStream(temporary))
      renameSync(temporary, finalPath)
      const result: UploadResult = { filename, url: `/uploads/videos/${filename}`, size: manifest.fileSize, hash: hash.digest('hex'), mimetype: guessMime(filename) }
      this.save(dir, { ...manifest, result })
      // Keep the receipt for resume after browser refresh / server restart, remove only known chunk files.
      for (let i = 0; i < manifest.chunkHashes.length; i++) { try { unlinkSync(join(dir, `chunk_${i}`)) } catch {} }
      return result
    } catch (error) {
      if (existsSync(temporary)) unlinkSync(temporary)
      throw error
    }
  }
}
