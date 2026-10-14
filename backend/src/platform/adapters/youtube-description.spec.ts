import 'reflect-metadata'
import { YoutubeAdapter } from './youtube.adapter'

const config: any = { appId: 'fake-client', appSecret: 'fake-secret', refreshToken: 'fake-refresh', extra: { expectedChannelId: 'channel-a' } }
const input = { videoId: 'abcdefghijk', sourceTitle: '设备演示', sourceDescription: 'Old description', description: 'New specific equipment description.' }
const snippet = { title: input.sourceTitle, description: input.sourceDescription, channelId: 'channel-a', categoryId: '28', tags: ['equipment'], defaultLanguage: 'en' }
const response = (body: any, status = 200) => new Response(JSON.stringify(body), { status })
describe('YouTube description updates', () => {
  let adapter: YoutubeAdapter, api: jest.SpyInstance
  beforeEach(() => {
    adapter = new YoutubeAdapter()
    jest.spyOn(adapter as any, 'refreshAccessToken').mockResolvedValue('fake-token')
    jest.spyOn(adapter, 'identifyChannelWithToken').mockResolvedValue({ id: 'channel-a', title: 'Test channel' })
    api = jest.spyOn(global, 'fetch')
  })
  afterEach(() => jest.restoreAllMocks())
  function existing(value = snippet) { api.mockResolvedValueOnce(response({ items: [{ id: input.videoId, etag: 'version-a', snippet: value }] })) }
  it('changes only description and preserves all other writable snippet fields', async () => {
    existing()
    api.mockResolvedValueOnce(response({ id: input.videoId, snippet: { ...snippet, description: input.description } }))
    expect((await adapter.updateVideoDescription(config, input)).description).toBe(input.description)
    const [url, init] = api.mock.calls[1]
    expect(url).toContain('?part=snippet')
    expect(init.method).toBe('PUT')
    expect(init.headers['If-Match']).toBe('version-a')
    expect(JSON.parse(init.body)).toEqual({ id: input.videoId, snippet: { title: snippet.title, description: input.description, categoryId: '28', tags: ['equipment'], defaultLanguage: 'en' } })
  })
  it('refuses foreign channels and changed source metadata without writing', async () => {
    existing({ ...snippet, channelId: 'channel-b' })
    await expect(adapter.updateVideoDescription(config, input)).rejects.toThrow('不属于')
    existing({ ...snippet, description: 'Changed elsewhere' })
    await expect(adapter.updateVideoDescription(config, input)).rejects.toThrow('已变化')
    existing({ ...snippet, title: 'Changed title' })
    await expect(adapter.updateVideoDescription(config, input)).rejects.toThrow('已变化')
    expect(api.mock.calls.every(([, init]) => !init.method)).toBe(true)
  })
  it('recognizes an already applied change and makes no repeated write', async () => {
    existing({ ...snippet, description: input.description })
    expect((await adapter.updateVideoDescription(config, input)).unchanged).toBe(true)
    expect(api).toHaveBeenCalledTimes(1)
  })
  it('reports unknown results and rejects concurrent edits using the etag', async () => {
    existing(); api.mockRejectedValueOnce(new Error('network with fake-token'))
    await expect(adapter.updateVideoDescription(config, input)).rejects.toThrow('更新结果待核对')
    existing(); api.mockResolvedValueOnce(response({}, 412))
    await expect(adapter.updateVideoDescription(config, input)).rejects.toThrow('其他操作修改')
  })
  it('validates UTF-8 byte length and video ID before contacting YouTube', async () => {
    for (const patch of [{ videoId: '../bad' }, { description: '' }, { description: '中'.repeat(1667) }, { description: '<invalid>' }]) await expect(adapter.updateVideoDescription(config, { ...input, ...patch })).rejects.toThrow('无效')
    expect(api).not.toHaveBeenCalled()
  })
})
