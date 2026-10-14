import { YoutubeQuotaService, nextQuotaReset, quotaDay } from './youtube-quota.service'

describe('YouTube shared quota snapshots', () => {
  const now = new Date('2026-10-13T06:52:00Z')
  const accounts = [
    { id: 'a', appId: '123-first.apps.googleusercontent.com', channelTitle: 'A', enabled: true, appSecret: 'do-not-expose', refreshToken: 'private-token' },
    { id: 'b', appId: '123-second.apps.googleusercontent.com', channelTitle: 'B', enabled: false },
    { id: 'c', appId: '456-other.apps.googleusercontent.com', channelTitle: 'C', enabled: true },
    { id: 'd', appId: 'custom-client', channelTitle: 'D' },
    { id: 'e', appId: 'another-custom', channelTitle: 'E' },
  ]
  let records: any[], save: jest.Mock, service: YoutubeQuotaService
  beforeEach(() => {
    records = [{ projectNumber: '123', dailyLimit: 10000, used: 9955, observedAt: now.toISOString() }]
    save = jest.fn(async row => { records = [row] })
    service = new YoutubeQuotaService({ find: async () => accounts } as any, { find: async () => records, save } as any, { read: async () => ({ connected: false, metrics: [] }) } as any)
  })
  it('groups different OAuth clients in the same project without exposing secrets or inventing unknown balances', async () => {
    const result = await service.list(now)
    expect(result.groups).toHaveLength(4)
    expect(result.groups[0].channels.map(a => a.title)).toEqual(['A', 'B'])
    expect(result.groups[0].snapshot.remaining).toBe(45)
    expect(result.groups[1].snapshot).toBeNull()
    expect(result.groups[2].projectNumber).toBeNull()
    expect(JSON.stringify(result)).not.toMatch(/do-not-expose|private-token|first.apps/)
  })
  it('marks observations expired after Pacific midnight without pretending the quota has recovered', async () => {
    const result = await service.list(new Date('2026-10-13T07:00:00Z'))
    expect(result.groups[0].snapshot.expired).toBe(true)
    expect(result.groups[0].snapshot.used).toBe(9955)
    expect(result.nextResetAt).toBe('2026-10-14T07:00:00.000Z')
  })
  it('handles winter, summer and both DST transitions', () => {
    expect(quotaDay(now)).toBe('2026-10-12')
    for (const [time, reset] of [
      ['2026-10-13T06:52:00Z', '2026-10-13T07:00:00.000Z'],
      ['2026-11-01T06:00:00Z', '2026-11-01T07:00:00.000Z'],
      ['2026-11-01T10:00:00Z', '2026-11-02T08:00:00.000Z'],
      ['2026-03-08T07:00:00Z', '2026-03-08T08:00:00.000Z'],
      ['2026-03-08T11:00:00Z', '2026-03-09T07:00:00.000Z'],
    ]) expect(nextQuotaReset(new Date(time))).toBe(reset)
  })
  it('rejects unconfigured projects, fractional/negative quotas and future timestamps', async () => {
    const valid = { dailyLimit: 10000, used: 10, observedAt: now.toISOString() }
    await expect(service.save('999', valid, now)).rejects.toThrow('不属于')
    for (const patch of [{ used: -1 }, { used: 1.5 }, { dailyLimit: 0 }, { dailyLimit: Infinity }, { observedAt: 'invalid' }, { observedAt: '2026-10-14T00:00:00Z' }]) await expect(service.save('123', { ...valid, ...patch }, now)).rejects.toThrow()
    expect(save).not.toHaveBeenCalled()
  })
  it('persists manual observations and clamps overshot remaining values at zero', async () => {
    const result = await service.save('123', { dailyLimit: 100, used: 101, observedAt: now.toISOString() }, now)
    expect(save).toHaveBeenCalledTimes(1)
    expect(result.groups[0].snapshot).toMatchObject({ remaining: 0, source: 'manual_console', expired: false })
  })
})
