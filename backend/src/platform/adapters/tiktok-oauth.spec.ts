import { TiktokAdapter } from './tiktok.adapter'
import { codeChallenge } from './http.util'

describe('TikTok Desktop OAuth', () => {
  const adapter = new TiktokAdapter()
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
  const redirectUri = 'http://localhost:5001/platform/tiktok/oauth/callback'

  it('uses TikTok hex S256 while preserving state and the registered callback', () => {
    const url = new URL(adapter.buildAuthUrl({
      state: 'unique-state', redirectUri, codeVerifier: verifier,
      config: { code: 'tiktok', enabled: true, appId: 'test-client' },
    }))
    expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/')
    expect(url.searchParams.get('code_challenge')).toBe('13d31e961a1ad8ec2f16b10c4c982e0876a878ad6df144566ee1894acb70f9c3')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).toBe('unique-state')
    expect(url.searchParams.get('redirect_uri')).toBe(redirectUri)
    expect(url.searchParams.get('client_key')).toBe('test-client')
  })

  it('keeps the standard PKCE helper unchanged for other platforms', () => {
    expect(codeChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('rejects an authorization request without a verifier', () => {
    expect(() => adapter.buildAuthUrl({ state: 'state', redirectUri, config: { code: 'tiktok', enabled: true, appId: 'test-client' } })).toThrow('PKCE')
  })
})

describe('TikTok video list API', () => {
  afterEach(() => jest.restoreAllMocks())

  it('requests display fields and follows the server cursor without filtering the first page to epoch zero', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ error: { code: 'ok' }, data: { videos: [{ id: 'one', title: 'First video' }], has_more: true, cursor: 1700000000000 } }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ error: { code: 'ok' }, data: { videos: [{ id: 'two', title: 'Second video' }], has_more: false } }) } as Response)
    const videos = await new TiktokAdapter().listUserVideos({ code: 'tiktok', enabled: true, accessToken: 'test-token' })
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('fields')?.split(',')).toEqual(expect.arrayContaining(['id', 'title', 'video_description', 'cover_image_url']))
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).not.toHaveProperty('cursor')
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).cursor).toBe(1700000000000)
    expect(videos.map(v => v.id)).toEqual(['one', 'two'])
  })
})
