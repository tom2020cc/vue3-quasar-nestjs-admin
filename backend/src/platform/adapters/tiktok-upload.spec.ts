import { mkdtempSync, openSync, ftruncateSync, closeSync, rmSync } from 'fs'
import { join, resolve, sep } from 'path'
import { tmpdir } from 'os'
import { TiktokAdapter } from './tiktok.adapter'
import { tiktokUploadPlan } from './tiktok-upload'
import { Orientation } from './platform.interface'

const MB = 1024 * 1024
describe('TikTok upload protocol', () => {
  const originalFetch = global.fetch
  let root: string
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'tiktok-upload-test-')); jest.spyOn(TiktokAdapter.prototype, 'creatorInfo').mockResolvedValue({ nickname: 'Test', username: 'test', privacyLevels: ['SELF_ONLY'], maxDuration: 300 }) })
  afterEach(() => {
    jest.restoreAllMocks()
    global.fetch = originalFetch
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep) || !root.includes('tiktok-upload-test-')) throw Error('unsafe test path')
    rmSync(root, { recursive: true, force: true })
  })
  function input(size: number) {
    const filePath = join(root, 'sample.mp4')
    const fd = openSync(filePath, 'w'); ftruncateSync(fd, size); closeSync(fd)
    return { filePath, fileName: 'sample.mp4', size, mime: 'video/mp4', orientation: Orientation.PORTRAIT, title: 'test only', duration: 6, tiktokPrivacyLevel: 'SELF_ONLY' }
  }
  test.each([1, 4 * MB, 5 * MB, 20436015, 64 * MB, 64 * MB + 1, 70 * MB, 70 * MB + 123])('valid plan for %i bytes', size => {
    const plan = tiktokUploadPlan(size)
    expect(plan.totalChunkCount).toBe(Math.floor(size / plan.chunkSize))
    if (size <= 64 * MB) expect(plan).toEqual({ chunkSize: size, totalChunkCount: 1 })
    const last = size - plan.chunkSize * (plan.totalChunkCount - 1)
    expect(last).toBeGreaterThanOrEqual(plan.chunkSize)
    expect(last).toBeLessThanOrEqual(128 * MB)
  })
  it('uploads the reported 19.5 MB video as one exact chunk', async () => {
    const video = input(20436015)
    let calls = 0
    global.fetch = jest.fn(async (_url, options: any) => {
      if (++calls === 1) {
        expect(JSON.parse(options.body).source_info).toEqual({ source: 'FILE_UPLOAD', video_size: video.size, chunk_size: video.size, total_chunk_count: 1 })
        return { ok: true, json: async () => ({ error: { code: 'ok' }, data: { publish_id: 'test-session', upload_url: 'https://upload.example.test/video' } }) } as any
      }
      expect(options.headers['Content-Length']).toBe(String(video.size))
      expect(options.headers['Content-Range']).toBe(`bytes 0-${video.size - 1}/${video.size}`)
      expect(options.body.length).toBe(video.size)
      return { status: 201 } as any
    })
    const result = await new TiktokAdapter().publish(video, { code: 'tiktok', enabled: true, accessToken: 'test-only' })
    expect(result).toMatchObject({ success: true, pending: true, externalId: 'test-session' })
    expect(calls).toBe(2)
  })
  it('merges trailing bytes into the final chunk and sends consecutive ranges', async () => {
    const video = input(70 * MB + 123)
    let offset = 0; let puts = 0
    global.fetch = jest.fn(async (_url, options: any) => {
      if (options.method === 'POST') {
        expect(JSON.parse(options.body).source_info.total_chunk_count).toBe(7)
        return { ok: true, json: async () => ({ data: { publish_id: 'test-session', upload_url: 'https://upload.example.test/video' } }) } as any
      }
      const length = ++puts === 7 ? 10 * MB + 123 : 10 * MB
      expect(options.body.length).toBe(length)
      expect(options.headers['Content-Range']).toBe(`bytes ${offset}-${offset + length - 1}/${video.size}`)
      offset += length
      return { status: puts === 7 ? 201 : 206 } as any
    })
    expect((await new TiktokAdapter().publish(video, { code: 'tiktok', enabled: true, accessToken: 'test-only' })).success).toBe(true)
    expect(offset).toBe(video.size); expect(puts).toBe(7)
  })
  it('does not report uploaded when PUT is rejected', async () => {
    const video = input(20)
    global.fetch = jest.fn(async (_url, options: any) => options.method === 'POST'
      ? { ok: true, json: async () => ({ data: { publish_id: 'test-session', upload_url: 'https://upload.example.test/video' } }) } as any
      : { status: 403 } as any)
    const result = await new TiktokAdapter().publish(video, { code: 'tiktok', enabled: true, accessToken: 'test-only' })
    expect(result.success).toBe(false); expect(result.pending).toBeUndefined()
    expect(result.message).toContain('HTTP 403')
  })
  it('does not upload if initialization reports an error', async () => {
    const video = input(20)
    global.fetch = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 'invalid_params', message: 'test error' } }) }) as any)
    const result = await new TiktokAdapter().publish(video, { code: 'tiktok', enabled: true, accessToken: 'test-only' })
    expect(result.success).toBe(false); expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
