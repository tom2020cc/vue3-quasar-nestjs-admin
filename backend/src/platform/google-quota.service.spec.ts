import { CLOUD_READ_SCOPES, dailyLimits, GoogleQuotaService, rateUsage } from './google-quota.service'
import { quotaStart } from './quota-time'

describe('Automatic Cloud quota reads', () => {
  const now = new Date('2026-10-13T08:00:00Z'), start = new Date('2026-10-13T07:00:00Z')
  const point = (value: number, begin = '2026-10-13T07:10:00Z', end = '2026-10-13T07:11:00Z') => ({ interval: { startTime: begin, endTime: end }, value: { int64Value: String(value) } })
  const metric = { metric: 'youtube.googleapis.com/default', displayName: 'Queries', consumerQuotaLimits: [{ unit: '1/d/{project}', name: 'metric/limits/QueriesPerDay', displayName: 'Queries per day', quotaBuckets: [{ effectiveLimit: '10000' }] }, { unit: '1/min/{project}', quotaBuckets: [{ effectiveLimit: '1800000' }] }] }
  const cred = { projectNumber: '123', appId: '123-app.apps.googleusercontent.com', appSecret: 'secret-do-not-log', refreshToken: 'refresh-do-not-log' }
  let fetchMock: jest.SpyInstance
  beforeEach(() => { fetchMock = jest.spyOn(global, 'fetch') })
  afterEach(() => jest.restoreAllMocks())
  it('uses Pacific midnight, including DST days', () => {
    expect(quotaStart(now)).toEqual(start)
    expect(quotaStart(new Date('2026-11-01T12:00:00Z')).toISOString()).toBe('2026-11-01T07:00:00.000Z')
    expect(quotaStart(new Date('2026-03-08T12:00:00Z')).toISOString()).toBe('2026-03-08T08:00:00.000Z')
  })
  it('selects daily project limits and never invents missing quota buckets', () => {
    expect(dailyLimits([metric])).toEqual([{ metric: metric.metric, name: 'Queries per day', limitName: 'QueriesPerDay', dailyLimit: 10000 }])
    expect(dailyLimits([{ ...metric, consumerQuotaLimits: [{ unit: '1/d/{project}', quotaBuckets: [] }] }])[0].dailyLimit).toBeNull()
  })
  it('sums quota units by method and excludes earlier days; missing is not zero', () => {
    const a = { metricKind: 'DELTA', metric: { labels: { method: 'update' } }, points: [point(50), point(500, '2026-10-13T06:59:00Z', '2026-10-13T07:00:00Z')] }
    const b = { metricKind: 'DELTA', metric: { labels: { method: 'list' } }, points: [point(1)] }
    expect(rateUsage([a, b, b], start, now, false)?.used).toBe(51)
    expect(rateUsage([], start, now, false)).toBeNull()
    expect(rateUsage([{ ...a, points: [point(0)] }], start, now, false)?.used).toBe(0)
  })
  it('uses one latest gauge per method across pages and rejects the old window', () => {
    const a = { metricKind: 'GAUGE', metric: { labels: { window_start_time: start.toISOString(), method: 'update' } }, points: [point(50)] }
    const b = { ...a, points: [point(100, undefined, '2026-10-13T07:12:00Z')] }
    expect(rateUsage([a, b], start, now, true)?.used).toBe(100)
    expect(rateUsage([{ ...a, metric: { labels: { window_start_time: '2026-10-12T07:00:00Z' } } }], start, now, true)).toBeNull()
  })
  it('does not query without a separate Cloud authorization', async () => {
    const service = new GoogleQuotaService({ findOneBy: async () => null } as any)
    expect((await service.read('123', now)).status).toBe('authorization_required')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('paginates limits and quota data, caches queries and keeps missing data unknown', async () => {
    const ok = (body: any) => ({ ok: true, json: async () => body }) as Response
    fetchMock.mockImplementation(async (input: any) => {
      const url = new URL(String(input))
      if (url.hostname === 'oauth2.googleapis.com') return ok({ access_token: 'private-access' })
      if (url.hostname === 'serviceusage.googleapis.com') return ok(url.searchParams.has('pageToken') ? { metrics: [metric] } : { metrics: [], nextPageToken: 'second' })
      expect(url.searchParams.get('interval.startTime')).toBe(start.toISOString())
      if (url.searchParams.get('filter')?.includes('ratev2')) return ok({})
      return ok({ timeSeries: [{ metricKind: 'DELTA', metric: { labels: { quota_metric: metric.metric, method: 'update' } }, points: [point(50)] }] })
    })
    const service = new GoogleQuotaService({ findOneBy: async () => cred } as any)
    const result = await service.read('123', now)
    expect(result.metrics[0]).toMatchObject({ used: 50, remaining: 9950, dailyLimit: 10000, stale: true })
    expect(JSON.stringify(result)).not.toMatch(/secret-do-not-log|refresh-do-not-log|private-access/)
    const calls = fetchMock.mock.calls.length
    await service.read('123', now)
    expect(fetchMock.mock.calls).toHaveLength(calls)
  })
  it('handles permission errors without leaking Google error bodies or reporting zero', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: { message: cred.appSecret } }) } as Response)
    const service = new GoogleQuotaService({ findOneBy: async () => cred } as any)
    const result = await service.read('123', now)
    expect(result.status).toBe('error')
    expect(result.metrics).toEqual([])
    expect(JSON.stringify(result)).not.toContain(cred.appSecret)
  })
  it('keeps actual limits and distinguishes the billing prerequisite from missing authorization', async () => {
    fetchMock.mockImplementation(async (input: any) => {
      const url = String(input)
      if (url.includes('oauth2.googleapis.com')) return { ok: true, json: async () => ({ access_token: 'token' }) } as Response
      if (url.includes('serviceusage.googleapis.com')) return { ok: true, json: async () => ({ metrics: [metric] }) } as Response
      return { ok: false, status: 403, json: async () => ({ error: { message: 'This API method requires billing to be enabled.', status: 'PERMISSION_DENIED' } }) } as Response
    })
    const service = new GoogleQuotaService({ findOneBy: async () => cred } as any)
    const result = await service.read('123', now)
    expect(result).toMatchObject({ connected: true, status: 'billing_required' })
    expect(result.metrics[0]).toMatchObject({ dailyLimit: 10000, used: null, remaining: null })
    expect(result.message).toContain('无需重复授权')
  })
  it('requires both read-only scopes and a refresh credential before saving', async () => {
    const save = jest.fn(), service = new GoogleQuotaService({ save } as any)
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ scope: CLOUD_READ_SCOPES[0], refresh_token: 'x' }) } as Response)
    await expect(service.authorize(cred, 'code', 'http://localhost/callback', 'verifier')).rejects.toThrow('离线授权')
    expect(save).not.toHaveBeenCalled()
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ scope: CLOUD_READ_SCOPES.join(' '), refresh_token: 'x' }) } as Response)
    await service.authorize(cred, 'code', 'http://localhost/callback', 'verifier')
    expect(save).toHaveBeenCalledWith({ ...cred, refreshToken: 'x' })
  })
})
