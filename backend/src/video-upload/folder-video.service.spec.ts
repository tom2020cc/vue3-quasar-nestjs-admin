import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync, truncateSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve, sep } from 'path'
import { createHash } from 'crypto'
import { FolderVideoService } from './folder-video.service'

describe('static folder scanning and local import', () => {
  let root: string, service: FolderVideoService
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'folder-video-test-'))
    mkdirSync(join(root, 'static', '挖掘机', '子目录'), { recursive: true })
    mkdirSync(join(root, 'backend'))
    writeFileSync(join(root, 'static', '挖掘机', '设备演示 2.MP4'), 'video-bytes')
    writeFileSync(join(root, 'static', '挖掘机', '说明.txt'), 'not-video')
    writeFileSync(join(root, 'static', '挖掘机', '子目录', 'nested.mp4'), 'nested')
    service = new FolderVideoService()
    Object.assign(service, { root: join(root, 'static'), backendRoot: join(root, 'backend') })
  })
  afterEach(() => {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep) || !root.includes('folder-video-test-')) throw new Error('unsafe test path')
    rmSync(root, { recursive: true, force: true })
  })
  it('uses folder name and extension-free titles, scans only direct videos', async () => {
    const scan = await service.scan(1, '挖掘机')
    expect(scan.playlistTitle).toBe('挖掘机')
    expect(scan.videos.map(v => v.title)).toEqual(['设备演示 2'])
    expect(scan.folders).toEqual([{ name: '子目录', path: '挖掘机/子目录' }])
    expect(scan.ignored).toBe(1)
  })
  it('adds deterministic suffixes for duplicate stems and preserves actual filenames', async () => {
    for (const name of ['重复.mp4', '重复.mov', '重复.mkv', '重复_1.mp4']) writeFileSync(join(root, 'static', name), 'x')
    const scan = await service.scan(1)
    const titles = scan.videos.map(v => v.title)
    expect(new Set(titles).size).toBe(4)
    expect(titles).toEqual(expect.arrayContaining(['重复', '重复_1', '重复_2', '重复_3']))
    expect((await service.scan(1)).videos.map(v => v.title)).toEqual(titles)
    expect(readdirSync(join(root, 'static'))).toContain('重复.mov')
  })
  it('keeps numbered duplicate titles within the platform title limit', async () => {
    const title = 'a'.repeat(100)
    for (const ext of ['.mp4', '.mov']) writeFileSync(join(root, 'static', title + ext), 'x')
    const scan = await service.scan(1)
    expect(scan.videos.every(v => v.title.length <= 100 && !v.error)).toBe(true)
    expect(scan.videos.some(v => v.title.endsWith('_1'))).toBe(true)
  })
  it.each(['../backend', '挖掘机/../../backend', '/absolute', 'C:\\Windows', '挖掘机\\子目录'])('rejects unsafe paths: %s', async path => {
    await expect(service.scan(1, path)).rejects.toThrow()
  })
  it('rejects linked folders even if target is within static', async () => {
    symlinkSync(join(root, 'static', '挖掘机'), join(root, 'static', 'alias'), 'junction')
    expect((await service.scan(1)).folders.map(f => f.name)).not.toContain('alias')
    await expect(service.scan(1, 'alias')).rejects.toThrow()
  })
  it('binds import tickets to the scanned file and local user', async () => {
    const video = (await service.scan(1, '挖掘机')).videos[0]
    await expect(service.importVideo(2, video.path, video.ticket)).rejects.toThrow()
    await expect(service.importVideo(1, video.path, 'forged')).rejects.toThrow()
    writeFileSync(join(root, 'static', video.path), 'changed-longer-content')
    await expect(service.importVideo(1, video.path, video.ticket)).rejects.toThrow()
  })
  it('copies byte-for-byte with content hash and reuses the same imported file', async () => {
    const video = (await service.scan(1, '挖掘机')).videos[0]
    const imported = await service.importVideo(1, video.path, video.ticket)
    expect(imported.hash).toBe(createHash('sha256').update('video-bytes').digest('hex'))
    expect(readFileSync(join(root, 'backend/uploads/videos', imported.filename), 'utf8')).toBe('video-bytes')
    expect(await service.importVideo(1, video.path, video.ticket)).toEqual(imported)
    expect(readdirSync(join(root, 'backend/uploads/videos'))).toEqual([imported.filename])
    expect(readFileSync(join(root, 'static', video.path), 'utf8')).toBe('video-bytes')
  })
  it('marks empty videos and long titles as unselectable', async () => {
    writeFileSync(join(root, 'static', 'empty.mp4'), '')
    writeFileSync(join(root, 'static', `${'a'.repeat(101)}.mp4`), 'x')
    expect((await service.scan(1)).videos.every(v => !!v.error)).toBe(true)
  })
  it('scans and imports a file larger than the former 500 MB cap using streams', async () => {
    const size = 501 * 1024 * 1024
    const path = join(root, 'static', 'large.mp4')
    writeFileSync(path, 'sample')
    truncateSync(path, size)
    const video = (await service.scan(1)).videos[0]
    expect(video.error).toBe('')
    expect(video.size).toBe(size)
    const result = await service.importVideo(1, video.path, video.ticket)
    expect(result.size).toBe(size)
    expect(statSync(join(root, 'backend/uploads/videos', result.filename)).size).toBe(size)
  }, 60000)
})
