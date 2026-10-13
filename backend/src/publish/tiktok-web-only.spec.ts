import { PublishService } from './publish.service'

describe('TikTok API publishing is retired', () => {
  function setup(records = []) {
    const taskRepo = { findOne: jest.fn().mockResolvedValue({ id:1 }), save:jest.fn() }
    const recordRepo = { find:jest.fn().mockResolvedValue(records), save:jest.fn() }
    const factory = {get:jest.fn()}
    const service = new PublishService(taskRepo as any, recordRepo as any, null, factory as any, null, null, null, null)
    const run = jest.spyOn(service as any, 'runPublish').mockResolvedValue(undefined)
    return { service, taskRepo, recordRepo, factory, run }
  }
  it('rejects new single and batch TikTok requests before saving or uploading', async () => {
    const {service,taskRepo,factory}=setup()
    await expect(service.createAndPublish({platforms:['youtube','tiktok']} as any)).rejects.toThrow('网页发布')
    expect((await service.createBatch([{platforms:['tiktok']} as any])).failed).toBe(1)
    expect(taskRepo.save).not.toHaveBeenCalled(); expect(factory.get).not.toHaveBeenCalled()
  })
  it('rejects TikTok-only retries without changing historical results', async () => {
    const records=[{platform:'tiktok', status:'failed', message:'original'}]
    const {service,recordRepo,run}=setup(records)
    await expect(service.retry(1)).rejects.toThrow('网页发布')
    expect(records[0].message).toBe('original');expect(recordRepo.save).not.toHaveBeenCalled();expect(run).not.toHaveBeenCalled()
  })
  it('retries other failed platforms while preserving TikTok and successful YouTube records', async () => {
    const records=[{platform:'tiktok', status:'failed'},{platform:'youtube',status:'success'},{platform:'facebook',status:'failed'}]
    const {service,recordRepo,run}=setup(records)
    expect((await service.retry(1)).count).toBe(1)
    expect(recordRepo.save).toHaveBeenCalledTimes(1)
    expect(records.map(r=>r.status)).toEqual(['failed','success','pending']); expect(run).toHaveBeenCalledWith(1)
  })
  it('blocks an already-queued TikTok record before calling the adapter', async () => {
    const {service,factory}=setup(); const record={platform:'tiktok',status:'pending'}
    await (service as any).publishOne({},record)
    expect(record.status).toBe('failed');expect(factory.get).not.toHaveBeenCalled()
  })
})
