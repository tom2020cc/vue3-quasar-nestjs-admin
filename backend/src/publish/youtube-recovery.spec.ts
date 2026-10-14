import { PublishService } from './publish.service'

describe('YouTube lost response recovery', () => {
  function setup(videos: any[], externalId?: string) {
    const service: any = Object.create(PublishService.prototype)
    const record = { id: 5, platform: 'youtube', status: 'failed', mock: false, targetChannelId: 'bound-channel', externalId }
    const task = { id: 12, title: 'Rig', description: 'Field test', duration: 30.2, createTime: new Date(Date.now() - 60000), records: [record] }
    service.findOne = jest.fn().mockResolvedValue(task)
    service.resolveRecordConfig = jest.fn().mockResolvedValue({ extra: { expectedChannelId: 'bound-channel' } })
    service.factory = { get: jest.fn().mockReturnValue({ listChannelVideos: jest.fn().mockResolvedValue(videos) }) }
    service.recordRepo = { findOne: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue({ affected: 1 }) }
    service.updateTaskStatus = jest.fn()
    return { service, task, record }
  }
  const video = () => ({ id: 'abcdefghijk', title: 'Rig', description: 'Field test', duration: 30, publishedAt: new Date().toISOString() })
  it('recovers one exact recent video and schedules original-record reconciliation', async () => {
    const { service } = setup([video()])
    await service.checkYoutubeStatus(12)
    expect(service.recordRepo.update).toHaveBeenCalledWith({ id: 5, status: 'failed' }, expect.objectContaining({ externalId: 'abcdefghijk', status: 'processing', pollCount: 0 }))
  })
  it.each(['old', 'description', 'duration', 'ambiguous'])('does not attach %s matches', async kind => {
    const v = video()
    if (kind === 'old') v.publishedAt = '2020-01-01T00:00:00Z'
    if (kind === 'description') v.description = 'Other footage'
    if (kind === 'duration') v.duration = 90
    const { service } = setup(kind === 'ambiguous' ? [v, { ...v, id: 'zyxwvutsrqp' }] : [v])
    await expect(service.checkYoutubeStatus(12)).rejects.toThrow()
    expect(service.recordRepo.update).not.toHaveBeenCalled()
  })
  it('uses an existing video ID without scanning or uploading again', async () => {
    const { service } = setup([], 'abcdefghijk')
    await service.checkYoutubeStatus(12)
    expect(service.factory.get).not.toHaveBeenCalled()
  })
  it('does not modify active tasks or steal a video linked to another task', async () => {
    const { service, record } = setup([video()])
    record.status = 'processing'
    await expect(service.checkYoutubeStatus(12)).rejects.toThrow()
    record.status = 'failed'
    service.recordRepo.findOne.mockResolvedValue({ id: 99 })
    await expect(service.checkYoutubeStatus(12)).rejects.toThrow()
    expect(service.recordRepo.update).not.toHaveBeenCalled()
  })
})
