import { TiktokController } from './tiktok.controller'
import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { TiktokAccount } from './entities/tiktok-account.entity'
import { PublishTask } from '../publish/entities/publish-task.entity'
import { PublishRecord } from '../publish/entities/publish-record.entity'
import { TiktokAccountService } from './tiktok-account.service'
import { TiktokAdapter } from './adapters/tiktok.adapter'
import { PublishService } from '../publish/publish.service'
import { OAuthService } from './oauth.service'
import { Orientation } from './adapters/platform.interface'

const openA = 'open-A'
const openB = 'open-B'

describe('TikTok account isolation', () => {
  let db: DataSource
  let accounts: TiktokAccountService
  let publisher: PublishService
  let root: string
  let adapter: any
  let platforms: any
  let run: jest.SpyInstance
  beforeEach(async () => {
    db = await new DataSource({ type: 'better-sqlite3', database: ':memory:',
      entities: [TiktokAccount, PublishTask, PublishRecord], synchronize: true }).initialize()
    root = mkdtempSync(join(tmpdir(), 'tiktok-channel-test-'))
    mkdirSync(join(root, 'uploads/videos'), { recursive: true })
    writeFileSync(join(root, 'uploads/videos/test.mp4'), 'local test bytes only')
    jest.spyOn(process, 'cwd').mockReturnValue(root)
    platforms = { findByCode: jest.fn().mockResolvedValue({ code: 'tiktok', enabled: true,
      appId: 'client-A', appSecret: 'secret-A', refreshToken: 'refresh-A' }), saveTokens: jest.fn() }
    adapter = { meta: new TiktokAdapter().meta,
      identifyUser: jest.fn(async token => ({ openId: token === 'access-B' ? openB : openA, displayName: token === 'access-B' ? 'B' : 'A' })),
      refresh: jest.fn(async config => ({ accessToken: config.accessToken || 'access-A', refreshToken: 'rotated-' + config.refreshToken,
        openId: config.openId || openA, expiresIn: 86400 })),
      publish: jest.fn().mockResolvedValue({ success: true, externalId: 'test-video' }) }
    accounts = new TiktokAccountService(db.getRepository(TiktokAccount), platforms, adapter)
    publisher = new PublishService(db.getRepository(PublishTask), db.getRepository(PublishRecord),
      platforms, { get: () => adapter } as any, { recordFromPublish: jest.fn() } as any, {} as any, {} as any, accounts)
    // Creation is exercised normally, but never starts background or real publication.
    run = jest.spyOn(publisher, 'runPublish').mockResolvedValue(undefined)
  })
  afterEach(async () => {
    jest.restoreAllMocks()
    await db.destroy()
    rmSync(root, { recursive: true, force: true })
  })
  async function twoAccounts() {
    const config = await platforms.findByCode('tiktok')
    const a = await accounts.saveAuthorization(config, { accessToken: 'access-A', refreshToken: 'refresh-A', openId: openA, expiresIn: 86400 })
    const b = await accounts.saveAuthorization(config, { accessToken: 'access-B', refreshToken: 'refresh-B', openId: openB, expiresIn: 86400 })
    return { a, b }
  }
  // Seed pre-retirement database records; the public API must no longer create these.
  async function legacyTask(accountId: string, openId: string) {
    const task = await db.getRepository(PublishTask).save({ title: 'Legacy', videoFilename: 'test.mp4',
      videoUrl: '/uploads/videos/test.mp4', videoPath: join(root, 'uploads/videos/test.mp4'), orientation: 'portrait' })
    await db.getRepository(PublishRecord).save({ taskId: task.id, platform: 'tiktok', status: 'pending',
      tiktokAccountId: accountId, targetTiktokOpenId: openId, targetTiktokAppId: 'client-A', tiktokPrivacyLevel: 'SELF_ONLY', mock: false })
    return task
  }
  const taskInput = (id?: string) => ({ title: 'Test', videoFilename: 'test.mp4', orientation: 'portrait' as const,
    width: 1080, height: 1920, videoHash: 'same-content', platforms: ['tiktok'], tiktokPrivacyLevel: 'SELF_ONLY', tiktokAccountId: id })

  it('migrates legacy authorization once, then identifies it without replacing the credentials', async () => {
    await accounts.onApplicationBootstrap()
    await accounts.onApplicationBootstrap()
    const [pending] = await accounts.list()
    expect(pending.verified).toBe(false)
    await expect(accounts.resolve(pending.id)).rejects.toThrow('识别账号')
    await accounts.identify(pending.id)
    expect((await accounts.resolve(pending.id)).openId).toBe(openA)
    expect((await accounts.get(pending.id)).refreshToken).toBe('rotated-refresh-A')
    expect(await db.getRepository(TiktokAccount).count()).toBe(1)
    expect(JSON.stringify(await accounts.list())).not.toMatch(/secret-A|refresh-A|access-A/)
  })
  it('adds a second account independently and rejects reauthorization into a different account', async () => {
    const { a, b } = await twoAccounts()
    await expect(accounts.saveAuthorization(await platforms.findByCode('tiktok'),
      { accessToken: 'access-B', refreshToken: 'replacement', openId: openB }, a.id)).rejects.toThrow('原账号未改变')
    expect((await accounts.get(a.id)).refreshToken).toBe('refresh-A')
    expect((await accounts.get(b.id)).refreshToken).toBe('refresh-B')
  })
  it('rejects new API publication for both authorized and disabled accounts', async () => {
    const { a } = await twoAccounts()
    await expect(publisher.createAndPublish(taskInput())).rejects.toThrow('网页发布')
    await expect(publisher.createAndPublish(taskInput(a.id))).rejects.toThrow('网页发布')
    await accounts.update(a.id, { enabled: false })
    await expect(publisher.createAndPublish(taskInput(a.id))).rejects.toThrow('网页发布')
    expect(await db.getRepository(PublishTask).count()).toBe(0)
    expect(adapter.publish).not.toHaveBeenCalled()
  })
  it('resolves historical records only with their original account identity', async () => {
    const { b } = await twoAccounts()
    const record = { platform: 'tiktok', tiktokAccountId: b.id, targetTiktokOpenId: openB, targetTiktokAppId: 'client-A' }
    expect(await publisher.resolveRecordConfig(record as any)).toMatchObject({ openId: openB })
    await expect(publisher.resolveRecordConfig({ ...record, targetTiktokOpenId: openA } as any)).rejects.toThrow('不一致')
    await expect(publisher.resolveRecordConfig({ platform: 'tiktok' } as any)).rejects.toThrow('旧任务')
  })
  it('rejects all TikTok batch entries without creating tasks', async () => {
    const { a, b } = await twoAccounts()
    const result = await publisher.createBatch([taskInput(a.id), taskInput(b.id), taskInput(b.id)])
    expect(result.success).toBe(0)
    expect(result.failed).toBe(3)
    expect(await db.getRepository(PublishTask).count()).toBe(0)
    expect(adapter.publish).not.toHaveBeenCalled()
  })
  it('keeps OAuth client and reauthorization account bound to the original state', async () => {
    const { a } = await twoAccounts()
    adapter.buildAuthUrl = ({ state }) => 'https://example.test/?state=' + state
    adapter.exchangeCode = jest.fn().mockResolvedValue({ accessToken: 'access-A', refreshToken: 'new-A', openId: openA, expiresIn: 86400 })
    const oauth = new OAuthService({ get: () => adapter } as any, platforms, { get: () => undefined } as any, {} as any, accounts, {} as any)
    const { url } = await oauth.buildAuthUrl('tiktok', a.id)
    const state = new URL(url).searchParams.get('state')
    await expect(oauth.handleCallback('youtube', { state, code: 'auth-code' })).rejects.toThrow('不匹配')
    platforms.findByCode.mockResolvedValue({ appId: 'changed-client', appSecret: 'changed-secret' })
    await oauth.handleCallback('tiktok', { state, code: 'auth-code' })
    expect(adapter.exchangeCode.mock.calls[0][0].config.appId).toBe('client-A')
    expect((await accounts.get(a.id)).refreshToken).toBe('new-A')
    expect(platforms.saveTokens).not.toHaveBeenCalled()
    await expect(oauth.handleCallback('tiktok', { state, code: 'auth-code' })).rejects.toThrow('state')
  })
  it('persists rotated refresh tokens once for concurrent requests and never changes the other account', async () => {
    const { a, b } = await twoAccounts()
    await db.getRepository(TiktokAccount).update(a.id, { tokenExpiresAt: new Date(0) })
    const configs = await Promise.all([accounts.readyConfig(a.id), accounts.readyConfig(a.id)])
    expect(adapter.refresh).toHaveBeenCalledTimes(1)
    expect(configs.every(c => c.openId === openA && c.refreshToken === null)).toBe(true)
    expect((await accounts.get(a.id)).refreshToken).toBe('rotated-refresh-A')
    expect((await accounts.get(b.id)).refreshToken).toBe('refresh-B')
    await db.getRepository(TiktokAccount).update(a.id, { tokenExpiresAt: new Date(0) })
    adapter.refresh.mockResolvedValue({ accessToken: 'wrong', openId: openB, expiresIn: 86400 })
    await expect(accounts.readyConfig(a.id)).rejects.toThrow('不一致')
    expect((await accounts.get(a.id)).accessToken).toBe('access-A')
  })

  it('reads videos with the selected account only and rejects an omitted account', async () => {
    const { a, b } = await twoAccounts()
    adapter.listUserVideos = jest.fn(async config => [{ id: config.openId }])
    const controller = new TiktokController(accounts, adapter)
    expect((await controller.listVideos(a.id)).data[0].id).toBe(openA)
    expect((await controller.listVideos(b.id)).data[0].id).toBe(openB)
    await expect(controller.listVideos(undefined)).rejects.toThrow('请选择')
    expect(adapter.listUserVideos).toHaveBeenCalledTimes(2)
  })

  it('preserves historical privacy and successful YouTube results when TikTok retry is rejected', async () => {
    const { a } = await twoAccounts()
    const task = await legacyTask(a.id, openA)
    await db.getRepository(PublishRecord).update({ taskId: task.id }, { status: 'failed' })
    const youtube = await db.getRepository(PublishRecord).save({ taskId: task.id, platform: 'youtube', status: 'success', externalId: 'existing-video' })
    await expect(publisher.retry(task.id, 'SELF_ONLY')).rejects.toThrow('网页发布')
    expect((await publisher.findOne(task.id)).records.find(r => r.platform === 'tiktok')).toMatchObject({ tiktokAccountId: a.id, tiktokPrivacyLevel: 'SELF_ONLY', status: 'failed' })
    expect(await db.getRepository(PublishRecord).findOneBy({ id: youtube.id })).toMatchObject({ status: 'success', externalId: 'existing-video' })
    expect(adapter.publish).not.toHaveBeenCalled()
  })
  it('never retries an accepted historical TikTok upload', async () => {
    const { a } = await twoAccounts()
    const task = await legacyTask(a.id, openA)
    await db.getRepository(PublishRecord).update({ taskId: task.id }, { status: 'failed', externalId: 'accepted-session' })
    await expect(publisher.retry(task.id, 'SELF_ONLY')).rejects.toThrow('网页发布')
    expect((await publisher.findOne(task.id)).records[0].externalId).toBe('accepted-session')
    expect(adapter.publish).not.toHaveBeenCalled()
  })
  it('blocks a historical queued record without calling the retired publisher', async () => {
    const { a } = await twoAccounts()
    const task = await legacyTask(a.id, openA)
    run.mockRestore()
    await publisher.runPublish(task.id)
    expect((await publisher.findOne(task.id)).records[0].status).toBe('failed')
    expect(adapter.publish).not.toHaveBeenCalled()
  })
  it('reconciles an interrupted task using its original account without resending any video', async () => {
    const { b } = await twoAccounts()
    const task = await legacyTask(b.id, openB)
    await expect(publisher.checkTiktokStatus(task.id)).rejects.toThrow('尚未获得')
    await db.getRepository(PublishRecord).update({ taskId: task.id }, { status: 'failed', externalId: 'accepted-session' })
    adapter.queryStatus = jest.fn().mockRejectedValueOnce(Error('rate limited')).mockResolvedValue({ status: 'success', message: 'TikTok 发布完成' })
    await expect(publisher.checkTiktokStatus(task.id)).rejects.toThrow('rate limited')
    expect((await publisher.findOne(task.id)).records[0].status).toBe('failed')
    const result = await publisher.checkTiktokStatus(task.id)
    expect(result.status).toBe('success')
    expect(adapter.queryStatus.mock.calls[1][0]).toMatchObject({ externalId: 'accepted-session', config: { openId: openB } })
    expect(adapter.publish).not.toHaveBeenCalled()
    await expect(publisher.checkTiktokStatus(task.id)).rejects.toThrow('运行中的任务')
  })
  it('recovers an interrupted session after restart without reuploading', async () => {
    const { a } = await twoAccounts()
    const task = await legacyTask(a.id, openA)
    await db.getRepository(PublishRecord).update({ taskId: task.id }, { status: 'publishing', externalId: 'accepted-session', mock: false })
    await publisher.onApplicationBootstrap()
    const result = await publisher.findOne(task.id)
    expect(result.status).toBe('failed')
    expect(result.records[0]).toMatchObject({ status: 'failed', externalId: 'accepted-session' })
    expect(result.records[0].message).toContain('后端重启')
    expect(adapter.publish).not.toHaveBeenCalled()
  })

})
