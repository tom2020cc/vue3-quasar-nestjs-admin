import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { createHash } from 'crypto'
import { VideoUploadService, CHUNK_SIZE, UploadManifest } from './video-upload.service'

const hash = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
describe('resumable local video uploads', () => {
  let root: string
  let service: VideoUploadService
  let input: UploadManifest
  let chunks: Buffer[]
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'video-resume-test-'))
    service = new VideoUploadService()
    ;(service as any).root = root
    chunks = [Buffer.alloc(CHUNK_SIZE, 7), Buffer.from('final-chunk')]
    const chunkHashes = chunks.map(hash)
    input = { uploadId: hash(chunkHashes.join('')), chunkHashes, fileName: 'demo.mp4', fileSize: chunks.reduce((n, b) => n + b.length, 0) }
  })
  afterEach(() => {
    // Test-owned temporary directory only.
    if (!resolve(root).startsWith(resolve(tmpdir()) + require('path').sep) || !root.includes('video-resume-test-')) throw new Error('unsafe test path')
    rmSync(root, { recursive: true, force: true })
  })
  it('resumes committed chunks after a new service instance and merges byte-for-byte', async () => {
    service.initialize(1, input)
    service.commitChunk(1, input.uploadId, 0, chunks[0])
    const restarted = new VideoUploadService(); (restarted as any).root = root
    expect(restarted.initialize(1, input).uploaded).toEqual([0])
    restarted.commitChunk(1, input.uploadId, 1, chunks[1])
    const result = await restarted.merge(1, input.uploadId)
    expect(readFileSync(join(root, 'uploads/videos', result.filename)).equals(Buffer.concat(chunks))).toBe(true)
    expect(result.hash).toBe(hash(Buffer.concat(chunks)))
  })
  it('rejects partial, incorrect and out-of-range chunks without counting them', () => {
    service.initialize(1, input)
    expect(() => service.commitChunk(1, input.uploadId, 0, chunks[0].subarray(0, 100))).toThrow()
    expect(() => service.commitChunk(1, input.uploadId, 0, Buffer.alloc(CHUNK_SIZE, 9))).toThrow()
    expect(() => service.commitChunk(1, input.uploadId, -1, chunks[1])).toThrow()
    expect(service.status(1, input.uploadId).uploaded).toEqual([])
  })
  it('ignores temporary files and detects corrupted committed files', async () => {
    service.initialize(1, input)
    const dir = join(root, '.upload-sessions/1', input.uploadId)
    writeFileSync(join(dir, 'chunk-interrupted.tmp'), chunks[0])
    writeFileSync(join(dir, 'chunk_0'), Buffer.alloc(CHUNK_SIZE, 99))
    expect(service.status(1, input.uploadId).uploaded).toEqual([])
    await expect(service.merge(1, input.uploadId)).rejects.toThrow('分片不完整')
  })
  it('returns the same file for concurrent merges and a lost-response retry after restart', async () => {
    service.initialize(1, input)
    chunks.forEach((b, i) => service.commitChunk(1, input.uploadId, i, b))
    const [one, two] = await Promise.all([service.merge(1, input.uploadId), service.merge(1, input.uploadId)])
    expect(one).toEqual(two)
    const restarted = new VideoUploadService(); (restarted as any).root = root
    expect(await restarted.merge(1, input.uploadId)).toEqual(one)
    expect(readdirSync(join(root, 'uploads/videos'))).toHaveLength(1)
    expect(restarted.initialize(1, input).result).toEqual(one)
  })
  it('isolates users and rejects uninitialized sessions', () => {
    service.initialize(1, input)
    service.commitChunk(1, input.uploadId, 0, chunks[0])
    expect(() => service.status(2, input.uploadId)).toThrow('请先初始化')
    expect(service.initialize(2, input).uploaded).toEqual([])
  })
  it('validates session fingerprints, sizes, names and ids', () => {
    for (const patch of [{ uploadId: '../bad' }, { fileSize: 0 }, { fileSize: -1 }, { fileSize: NaN }, { fileSize: Infinity }, { chunkHashes: [] }, { fileName: '' }]) {
      expect(() => service.initialize(1, { ...input, ...patch })).toThrow()
    }
    expect(existsSync(join(root, '.upload-sessions'))).toBe(false)
  })
  it('initializes a multi-gigabyte upload without a total file-size cap', () => {
    const fileSize = 3 * 1024 * 1024 * 1024
    const chunkHashes = Array(Math.ceil(fileSize / CHUNK_SIZE)).fill(hash('chunk'))
    const manifest = { fileName: 'large.mp4', fileSize, chunkHashes, uploadId: hash(chunkHashes.join('')) }
    expect(service.initialize(1, manifest).uploaded).toEqual([])
    expect(service.initialize(1, manifest).uploaded).toEqual([])
  })
  it('can reupload when the completed local file was removed', async () => {
    service.initialize(1, input)
    chunks.forEach((b, i) => service.commitChunk(1, input.uploadId, i, b))
    const result = await service.merge(1, input.uploadId)
    rmSync(join(root, 'uploads/videos', result.filename))
    expect(service.initialize(1, input).uploaded).toEqual([])
    chunks.forEach((b, i) => service.commitChunk(1, input.uploadId, i, b))
    expect((await service.merge(1, input.uploadId)).filename).not.toBe(result.filename)
  })
})
