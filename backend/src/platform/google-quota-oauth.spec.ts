import { OAuthService } from './oauth.service'
import { CLOUD_READ_SCOPES } from './google-quota.service'

it('binds Cloud read authorization to the requested project with PKCE and never overwrites channel authorization', async () => {
  const config = { appId: '123-client.apps.googleusercontent.com', appSecret: 'secret' }
  const adapter = { exchangeCode: jest.fn(), buildAuthUrl: jest.fn() }
  const accounts = { get: jest.fn(async () => config), config: a => a, saveAuthorization: jest.fn() }
  const cloud = { authorize: jest.fn() }, platforms = { saveTokens: jest.fn() }
  const service = new OAuthService({ get: () => adapter } as any, platforms as any, { get: () => undefined } as any, accounts as any, {} as any, cloud as any)
  const { url } = await service.buildAuthUrl('youtube', 'account', 'cloud-quota')
  const query = new URL(url).searchParams
  expect(query.get('scope').split(' ')).toEqual(CLOUD_READ_SCOPES)
  expect(query.get('redirect_uri')).toBe('http://localhost:5001/platform/youtube/oauth/callback')
  expect(query.get('code_challenge_method')).toBe('S256')
  expect(query.get('code_challenge')).toHaveLength(43)
  expect(query.get('scope')).not.toContain('youtube')
  const callback = { state: query.get('state'), code: 'code' }
  await expect(service.handleCallback('tiktok', callback)).rejects.toThrow('不匹配')
  expect(await service.handleCallback('youtube', callback)).toBe('google-cloud-quota')
  expect(cloud.authorize).toHaveBeenCalledWith(config, 'code', query.get('redirect_uri'), expect.any(String))
  expect(accounts.saveAuthorization).not.toHaveBeenCalled()
  expect(platforms.saveTokens).not.toHaveBeenCalled()
  expect(adapter.exchangeCode).not.toHaveBeenCalled()
  await expect(service.handleCallback('youtube', callback)).rejects.toThrow('state')
})
