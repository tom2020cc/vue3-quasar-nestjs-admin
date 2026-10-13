import { InstagramAdapter } from './instagram.adapter'

describe('Instagram direct login', () => {
  const adapter = new InstagramAdapter()
  const config = { code: 'instagram', enabled: true, appId: 'ig-app', appSecret: 'test-secret' }
  const redirectUri = 'https://local.example/platform/instagram/oauth/callback'
  let request: jest.SpyInstance
  const respond = (data: any, status = 200) => request.mockResolvedValueOnce(new Response(JSON.stringify(data), { status }))
  beforeEach(() => { request = jest.spyOn(global, 'fetch') })
  afterEach(() => { request.mockRestore() })

  it('uses Instagram login and only the required Instagram scopes', () => {
    const url = new URL(adapter.buildAuthUrl({ config, state: 'csrf-state', redirectUri }))
    expect(url.origin).toBe('https://www.instagram.com')
    expect(url.searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_content_publish')
    expect(url.searchParams.get('state')).toBe('csrf-state')
    expect(url.searchParams.get('redirect_uri')).toBe(redirectUri)
    expect(url.searchParams.get('client_id')).toBe('ig-app')
  })

  it.each([false, true])('exchanges short/long tokens and resolves the actual IG account (wrapped=%s)', async wrapped => {
    const short = { access_token: 'short-test', user_id: 'app-scoped', permissions: ['instagram_business_basic', 'instagram_business_content_publish'] }
    respond(wrapped ? { data: [short] } : short)
    respond({ access_token: 'long-test', expires_in: 5184000 })
    respond({ id: 'app-scoped', user_id: 'ig-professional', username: 'creator_test' })
    const result = await adapter.exchangeCode({ code: 'code-test', redirectUri, config })
    expect(result).toMatchObject({ accessToken: 'long-test', openId: 'ig-professional', expiresIn: 5184000, extra: { authType: 'instagram_login', username: 'creator_test', pageId: null } })
    expect(request.mock.calls[0][0]).toBe('https://api.instagram.com/oauth/access_token')
    expect((request.mock.calls[0][1].body as FormData).get('redirect_uri')).toBe(redirectUri)
    expect(request.mock.calls.every(([url]) => !String(url).includes('graph.facebook.com'))).toBe(true)
  })

  it('rejects missing publishing permission before saving or requesting a long token', async () => {
    respond({ access_token: 'short-test', permissions: ['instagram_business_basic'] })
    await expect(adapter.exchangeCode({ code: 'test', redirectUri, config })).rejects.toThrow('内容发布权限')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('does not expose the authorization response in errors', async () => {
    respond({ error: { code: 190, message: 'sensitive-code-or-token' } }, 400)
    await expect(adapter.exchangeCode({ code: 'test', redirectUri, config })).rejects.toThrow('错误码 190')
  })

  it('refreshes using the long lived access token without a refresh token', async () => {
    respond({ access_token: 'renewed-test', expires_in: 5184000 })
    await expect(adapter.refresh({ ...config, accessToken: 'long-test', extra: { authType: 'instagram_login' } })).resolves.toEqual({ accessToken: 'renewed-test', expiresIn: 5184000 })
    const url = new URL(String(request.mock.calls[0][0]))
    expect(url.searchParams.get('grant_type')).toBe('ig_refresh_token')
    await expect(adapter.refresh({ ...config, accessToken: 'facebook-token' })).rejects.toThrow('旧 Facebook 令牌')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('retrieves the permalink instead of constructing a URL from a numeric media ID', async () => {
    respond({ status_code: 'FINISHED' })
    respond({ id: '123456' })
    respond({ permalink: 'https://www.instagram.com/reel/AbCdEf/' })
    const result = await adapter.queryStatus({ externalId: 'container', config: { ...config, openId: 'ig-professional', accessToken: 'token', extra: { authType: 'instagram_login' } }, pollCount: 1 })
    expect(result).toMatchObject({ status: 'success', externalUrl: 'https://www.instagram.com/reel/AbCdEf/' })
    expect(String(request.mock.calls[1][0])).toBe('https://graph.instagram.com/ig-professional/media_publish')
  })

  it('does not fail a successful publication when the permalink is temporarily unavailable', async () => {
    respond({ status_code: 'FINISHED' })
    respond({ id: '123456' })
    respond({ error: { code: 4 } }, 429)
    const result = await adapter.queryStatus({ externalId: 'container', config: { ...config, openId: 'ig-professional', accessToken: 'token', extra: { authType: 'instagram_login' } }, pollCount: 1 })
    expect(result).toMatchObject({ status: 'success', externalUrl: '' })
  })
})
