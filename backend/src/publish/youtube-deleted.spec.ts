import 'reflect-metadata'
import { YoutubeAdapter } from '../platform/adapters/youtube.adapter'
import { PublishService } from './publish.service'

describe('explicitly release a user-deleted YouTube upload', () => {
  afterEach(() => jest.restoreAllMocks())
  it('requires the owning channel and an empty successful lookup; errors never unlock', async () => {
    const adapter = new YoutubeAdapter()
    jest.spyOn(adapter as any, 'refreshAccessToken').mockResolvedValue('test')
    const identify = jest.spyOn(adapter, 'identifyChannelWithToken').mockResolvedValue({ id: 'owner', title: 'Owner' })
    const fetcher = jest.spyOn(global, 'fetch')
    const config: any = { extra: { expectedChannelId: 'owner' } }
    for (const [body, status] of [[{ items: [{ id: 'abcdefghijk' }] }, 200], [{}, 200], [{ error: { message: 'quotaExceeded' } }, 403]] as const) {
      fetcher.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }))
      await expect(adapter.assertVideoDeleted(config, 'abcdefghijk')).rejects.toThrow()
    }
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
    await expect(adapter.assertVideoDeleted(config, 'abcdefghijk')).resolves.toBeUndefined()
    identify.mockResolvedValueOnce({ id: 'different', title: 'Other' })
    await expect(adapter.assertVideoDeleted(config, 'abcdefghijk')).rejects.toThrow('不一致')
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(fetcher.mock.calls.every(([, init]) => !init?.method)).toBe(true)
  })

  it('preserves history, refuses active records and writes only after verification', async () => {
    const service: any = Object.create(PublishService.prototype)
    const record: any = { id: 9, platform: 'youtube', status: 'success', externalId: 'abcdefghijk', mock: false, youtubeDeletedAt: null }
    service.findOne = jest.fn().mockResolvedValue({ id: 8, records: [record] })
    service.resolveRecordConfig = jest.fn().mockResolvedValue({})
    const verify = jest.fn().mockRejectedValue(new Error('Old video still exists'))
    service.factory = { get: () => ({ assertVideoDeleted: verify }) }
    service.recordRepo = { update: jest.fn() }
    await expect(service.releaseDeletedYoutube(8)).rejects.toThrow('still exists')
    expect(service.recordRepo.update).not.toHaveBeenCalled()
    record.status = 'processing'
    await expect(service.releaseDeletedYoutube(8)).rejects.toThrow('已成功')
    expect(verify).toHaveBeenCalledTimes(1)
    record.status = 'success'; verify.mockResolvedValue(undefined)
    await service.releaseDeletedYoutube(8)
    expect(service.recordRepo.update).toHaveBeenCalledWith({ id: 9, status: 'success', externalId: 'abcdefghijk' }, expect.objectContaining({ youtubeDeletedAt: expect.any(Date) }))
    const patch = service.recordRepo.update.mock.calls[0][1]
    expect(patch.externalId).toBeUndefined()
    expect(patch.status).toBeUndefined()
    record.youtubeDeletedAt = new Date()
    await service.releaseDeletedYoutube(8)
    expect(service.recordRepo.update).toHaveBeenCalledTimes(1)
  })
})
