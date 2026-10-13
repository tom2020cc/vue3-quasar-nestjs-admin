import 'reflect-metadata'
import { YoutubeAdapter } from './youtube.adapter'

const config: any = { appId: 'test-client', appSecret: 'test-secret', refreshToken: 'test-refresh', extra: { expectedChannelId: 'channel-a' } }
const response = (data: any, status = 200) => new Response(JSON.stringify(data), { status })

describe('YouTube playlists', () => {
  let adapter: YoutubeAdapter
  let api: jest.SpyInstance
  beforeEach(() => {
    adapter = new YoutubeAdapter()
    jest.spyOn(adapter as any, 'refreshAccessToken').mockResolvedValue('test-token')
    jest.spyOn(adapter, 'identifyChannelWithToken').mockResolvedValue({ id: 'channel-a', title: 'A' })
    jest.spyOn(adapter as any, 'thumbnailToBase64').mockResolvedValue('')
    api = jest.spyOn(global, 'fetch')
  })
  afterEach(() => jest.restoreAllMocks())

  it('loads playlist summaries without fetching memberships or thumbnails', async () => {
    api.mockResolvedValueOnce(response({ items: [{ id: 'list', snippet: { title: 'List', channelId: 'channel-a' } }] }))
    expect((await adapter.listChannelPlaylists(config, true))[0].title).toBe('List')
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('rejects creation for another authorized channel before sending a write', async () => {
    jest.spyOn(adapter, 'identifyChannelWithToken').mockResolvedValue({ id: 'channel-b', title: 'B' })
    await expect(adapter.createPlaylist(config, 'List', 'private')).rejects.toThrow('不一致')
    expect(api).not.toHaveBeenCalled()
  })

  it('creates a playlist with an explicit title and privacy', async () => {
    api.mockResolvedValueOnce(response({ id: 'new-list', snippet: { title: 'New list' } }))
    expect(await adapter.createPlaylist(config, ' New list ', 'private')).toEqual({ id: 'new-list', title: 'New list', privacyStatus: 'private' })
    expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({ snippet: { title: 'New list' }, status: { privacyStatus: 'private' } })
  })

  it('rejects old upload-only grants before creating a playlist', async () => {
    ;(adapter as any).refreshAccessToken.mockRestore()
    api.mockResolvedValueOnce(response({ access_token: 'test', scope: 'https://www.googleapis.com/auth/youtube.upload' }))
    await expect(adapter.createPlaylist(config, 'List', 'private')).rejects.toThrow('重新授权')
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('does not insert a duplicate membership when retrying', async () => {
    api.mockResolvedValueOnce(response({ items: [{ id: 'list', snippet: { channelId: 'channel-a' } }] }))
      .mockResolvedValueOnce(response({ items: [{ id: 'video', snippet: { channelId: 'channel-a' } }] }))
      .mockResolvedValueOnce(response({ items: [{ id: 'already-added' }] }))
    await adapter.addVideoToPlaylist(config, 'list', 'video')
    expect(api).toHaveBeenCalledTimes(3)
    expect(api.mock.calls.every(([, init]) => !init.method || init.method === 'GET')).toBe(true)
  })

  it('inserts the selected video only into its own channel playlist', async () => {
    api.mockResolvedValueOnce(response({ items: [{ id: 'list', snippet: { channelId: 'channel-a' } }] }))
      .mockResolvedValueOnce(response({ items: [{ id: 'video', snippet: { channelId: 'channel-a' } }] }))
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({ id: 'membership' }))
    await adapter.addVideoToPlaylist(config, 'list', 'video')
    expect(JSON.parse(api.mock.calls[3][1].body)).toEqual({ snippet: { playlistId: 'list', resourceId: { kind: 'youtube#video', videoId: 'video' } } })
  })

  it('refuses membership writes for a foreign playlist or video', async () => {
    api.mockResolvedValueOnce(response({ items: [{ snippet: { channelId: 'channel-b' } }] }))
    await expect(adapter.addVideoToPlaylist(config, 'list', 'video')).rejects.toThrow('不属于')
    api.mockResolvedValueOnce(response({ items: [{ snippet: { channelId: 'channel-a' } }] }))
      .mockResolvedValueOnce(response({ items: [{ snippet: { channelId: 'channel-b' } }] }))
    await expect(adapter.addVideoToPlaylist(config, 'list', 'video')).rejects.toThrow('不一致')
    expect(api).toHaveBeenCalledTimes(3)
  })

  it('paginates playlists and preserves counts including empty playlists', async () => {
    api.mockResolvedValueOnce(response({ items: [{ id: 'one', snippet: { title: 'One', channelId: 'channel-a' }, contentDetails: { itemCount: 5 }, status: { privacyStatus: 'public' } }], nextPageToken: 'next' }))
      .mockResolvedValueOnce(response({ items: [{ id: 'empty', snippet: { title: 'Empty', channelId: 'channel-a' }, contentDetails: { itemCount: 0 } }] }))
    api.mockResolvedValueOnce(response({ items: [] })).mockResolvedValueOnce(response({ items: [] }))
    const result = await adapter.listChannelPlaylists(config)
    expect(result.map(p => [p.id, p.itemCount])).toEqual([['one', 5], ['empty', 0]])
    expect(String(api.mock.calls[1][0])).toContain('pageToken=next')
  })

  it('collects all membership pages and preserves membership in multiple playlists', async () => {
    api.mockImplementation(async (url) => {
      const u = new URL(String(url))
      if (u.pathname.endsWith('/playlists')) return response({ items: ['a', 'b'].map(id => ({ id, snippet: { title: id, channelId: 'channel-a' } })) })
      if (u.searchParams.get('playlistId') === 'a' && !u.searchParams.has('pageToken')) {
        return response({ items: [{ contentDetails: { videoId: 'shared' } }], nextPageToken: 'next' })
      }
      if (u.searchParams.get('playlistId') === 'a') return response({ items: [{ contentDetails: { videoId: 'later' } }, { contentDetails: { videoId: 'shared' } }] })
      return response({ items: [{ contentDetails: { videoId: 'shared' } }] })
    })
    const result = await adapter.listChannelPlaylists(config)
    expect(result.map(p => p.videoIds)).toEqual([['shared', 'later'], ['shared']])
  })

  it('returns no playlists for a channel without playlists', async () => {
    api.mockResolvedValueOnce(response({ items: [] }))
    expect(await adapter.listChannelPlaylists(config)).toEqual([])
  })

  it('rejects tokens for a different channel before reading playlists', async () => {
    jest.spyOn(adapter, 'identifyChannelWithToken').mockResolvedValue({ id: 'channel-b', title: 'B' })
    await expect(adapter.listChannelPlaylists(config)).rejects.toThrow('不一致')
    expect(api).not.toHaveBeenCalled()
  })

  it('rejects a playlist owned by another channel', async () => {
    api.mockResolvedValueOnce(response({ items: [{ snippet: { channelId: 'channel-b' } }] }))
    await expect(adapter.listPlaylistVideos(config, 'other-list')).rejects.toThrow('不属于')
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('keeps playlist order, repeated videos and unavailable items across pages', async () => {
    const item = (id: string, videoId: string) => ({ id, snippet: { title: 'Unavailable' }, contentDetails: { videoId } })
    api.mockResolvedValueOnce(response({ items: [{ snippet: { channelId: 'channel-a' } }] }))
      .mockResolvedValueOnce(response({ items: [item('i1', 'v2'), item('i2', 'v1')], nextPageToken: 'page2' }))
      .mockResolvedValueOnce(response({ items: [item('i3', 'v2'), item('i4', 'missing')] }))
      .mockResolvedValueOnce(response({ items: [{ id: 'v1', snippet: { title: 'One', description: 'Full details' } }, { id: 'v2', snippet: { title: 'Two' } }] }))
    const result: any[] = await adapter.listPlaylistVideos(config, 'list-a')
    expect(result.map(v => v.id)).toEqual(['v2', 'v1', 'v2', 'missing'])
    expect(result.map(v => v.playlistItemId)).toEqual(['i1', 'i2', 'i3', 'i4'])
    expect(result[1].description).toBe('Full details')
    expect(result[3].unavailable).toBe(true)
  })

  it('does not disguise a Google API failure as an empty list', async () => {
    api.mockResolvedValueOnce(response({ error: { message: 'quota exceeded' } }, 403))
    await expect(adapter.listChannelPlaylists(config)).rejects.toThrow('quota exceeded')
  })
})
