import { YoutubeAdapter } from './youtube.adapter'
import * as http from './http.util'

describe('YouTube playlist read-after-create', () => {
  const config: any = { extra: { expectedChannelId: 'owner' } }
  afterEach(() => jest.restoreAllMocks())
  function setup() {
    const adapter: any = new YoutubeAdapter()
    const read = jest.spyOn(adapter, 'youtubeGet')
    jest.spyOn(http, 'sleep').mockResolvedValue(undefined)
    return { adapter, read }
  }
  it('waits for an empty read to become an owned playlist without creating again', async () => {
    const { adapter, read } = setup()
    read.mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce({ items: [{ id: 'list', snippet: { channelId: 'owner', title: 'English list' } }] })
    await expect(adapter.ownedPlaylist('token', config, 'list')).resolves.toEqual({ id: 'list', title: 'English list' })
    expect(read).toHaveBeenCalledTimes(2)
    expect(http.sleep).toHaveBeenCalledTimes(1)
  })
  it('bounds empty reads and rejects missing playlists', async () => {
    const { adapter, read } = setup()
    read.mockResolvedValue({ items: [] })
    await expect(adapter.ownedPlaylist('token', config, 'list')).rejects.toThrow()
    expect(read).toHaveBeenCalledTimes(3)
  })
  it.each(['wrong owner', 'wrong id', 'malformed', 'http error'])('never accepts or retries %s', async kind => {
    const { adapter, read } = setup()
    if (kind === 'http error') read.mockRejectedValue(new Error('quotaExceeded'))
    else read.mockResolvedValue(kind === 'malformed' ? {} : { items: [{ id: kind === 'wrong id' ? 'other' : 'list', snippet: { channelId: kind === 'wrong owner' ? 'other' : 'owner' } }] })
    await expect(adapter.ownedPlaylist('token', config, 'list')).rejects.toThrow()
    expect(read).toHaveBeenCalledTimes(1)
    expect(http.sleep).not.toHaveBeenCalled()
  })
  it('treats a lost upload response as unconfirmed and never repeats the upload', async () => {
    const adapter = new YoutubeAdapter()
    const publish = jest.spyOn(adapter as any, 'realPublish').mockRejectedValue(new TypeError('fetch failed'))
    const result = await adapter.publish({} as any, { refreshToken: 'test' } as any)
    expect(result.success).toBe(false)
    expect(result.message).toContain('上传结果待核对')
    expect(publish).toHaveBeenCalledTimes(1)
  })
})
