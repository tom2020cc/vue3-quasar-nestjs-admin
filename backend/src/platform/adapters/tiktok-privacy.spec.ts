import { TiktokAdapter } from './tiktok.adapter'
import { stat } from 'fs/promises'
import { readTiktokChunks } from './tiktok-upload'
import { Orientation } from './platform.interface'

jest.mock('fs/promises', () => ({ stat: jest.fn() }))
jest.mock('./tiktok-upload', () => ({ tiktokUploadPlan: () => ({ chunkSize: 10, totalChunkCount: 1 }), readTiktokChunks: jest.fn() }))

describe('TikTok creator privacy validation', () => {
  const original = global.fetch
  const config = { code: 'tiktok', enabled: true, accessToken: 'fake-test' }
  const input = { filePath: 'fixture', fileName: 'test.mp4', size: 10, mime: 'video/mp4', title: 'test', orientation: Orientation.PORTRAIT, duration: 6, tiktokPrivacyLevel: 'SELF_ONLY' }
  let options: string[]
  let initError: string | undefined
  beforeEach(() => {
    options = ['PUBLIC_TO_EVERYONE', 'SELF_ONLY']; initError = undefined
    ;(stat as jest.Mock).mockResolvedValue({ size: 10 })
    ;(readTiktokChunks as jest.Mock).mockImplementation(async function* () { yield { buffer: Buffer.alloc(10), offset: 0, final: true } })
    global.fetch = jest.fn(async (url: any) => {
      if (url.includes('creator_info')) return { ok: true, json: async () => ({ error: { code: 'ok' }, data: { creator_nickname: 'Test account', privacy_level_options: options, max_video_post_duration_sec: 60 } }) } as any
      if (url.includes('/init/')) return { ok: !initError, json: async () => initError ? { error: { code: initError } } : { error: { code: 'ok' }, data: { publish_id: 'test', upload_url: 'https://example.test/upload' } } } as any
      return { status: 201 } as any
    })
  })
  afterEach(() => { global.fetch = original; jest.clearAllMocks() })
  it('queries latest creator info and submits precisely the selected private visibility', async () => {
    expect((await new TiktokAdapter().publish(input, config)).pending).toBe(true)
    const calls = (global.fetch as jest.Mock).mock.calls
    expect(calls[0][0]).toContain('/creator_info/query/')
    expect(JSON.parse(calls[1][1].body).post_info).toMatchObject({ privacy_level: 'SELF_ONLY', disable_comment: true, disable_duet: true, disable_stitch: true })
  })
  it.each([undefined, 'INVALID', 'FOLLOWER_OF_CREATOR'])('blocks missing or disallowed choice %s before initialization', async level => {
    expect((await new TiktokAdapter().publish({ ...input, tiktokPrivacyLevel: level }, config)).success).toBe(false)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
  it('rejects an option removed since the UI query', async () => {
    options = ['SELF_ONLY']
    expect((await new TiktokAdapter().publish({ ...input, tiktokPrivacyLevel: 'PUBLIC_TO_EVERYONE' }, config)).success).toBe(false)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
  it('blocks duration exceeding creator limit', async () => {
    expect((await new TiktokAdapter().publish({ ...input, duration: 61 }, config)).message).toContain('60 秒')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
  it('explains audit rejection without falling back to a different visibility', async () => {
    initError = 'unaudited_client_can_only_post_to_private_accounts'
    const result = await new TiktokAdapter().publish(input, config)
    expect(result.success).toBe(false); expect(result.message).toContain('账号改为私密')
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
  it('fails closed when creator API rejects the grant', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({ error: { code: 'scope_not_authorized' } }) }) as any)
    expect((await new TiktokAdapter().publish(input, config)).message).toContain('重新授权')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
  it('persists the session before PUT and returns it when transfer fails', async () => {
    const save = jest.fn().mockResolvedValue(undefined)
    const fetchMock = global.fetch as jest.Mock
    const originalMock = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(async (url, args) => {
      if (args?.method === 'PUT') {
        expect(save).toHaveBeenCalledWith('test')
        throw new Error('connection lost')
      }
      return originalMock(url, args)
    })
    const result = await new TiktokAdapter().publish({ ...input, onUploadSession: save }, config)
    expect(result).toMatchObject({ success: false, externalId: 'test' })
    expect(result.message).toContain('勿重复上传')
  })
  it('does not transfer bytes when persisting the session fails', async () => {
    const result = await new TiktokAdapter().publish({ ...input, onUploadSession: async () => { throw Error('database unavailable') } }, config)
    expect(result.externalId).toBe('test')
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })
  it.each(['access_token_invalid', 'rate_limit_exceeded'])('does not treat API error %s as processing', async code => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: { code } }) }) as any)
    await expect(new TiktokAdapter().queryStatus({ externalId: 'test', config, pollCount: 0 })).rejects.toThrow()
  })
  it.each(['PROCESSING_UPLOAD', 'PROCESSING_DOWNLOAD', 'SEND_TO_USER_INBOX'])('does not report %s as published', async status => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ error: { code: 'ok' }, data: { status } }) }) as any)
    expect((await new TiktokAdapter().queryStatus({ externalId: 'test', config, pollCount: 0 })).status).toBe('processing')
  })
  it('recognizes a completed private post even without a public URL', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ error: { code: 'ok' }, data: { status: 'PUBLISH_COMPLETE' } }) }) as any)
    expect(await new TiktokAdapter().queryStatus({ externalId: 'test', config, pollCount: 0 })).toMatchObject({ status: 'success', externalUrl: '' })
  })
})
