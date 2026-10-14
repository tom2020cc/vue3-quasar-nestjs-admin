import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { YoutubeAccount } from './entities/youtube-account.entity'
import { PublishTask } from '../publish/entities/publish-task.entity'
import { PublishRecord } from '../publish/entities/publish-record.entity'
import { YoutubeAccountService } from './youtube-account.service'
import { YoutubeAdapter } from './adapters/youtube.adapter'
import { PublishPollerService } from '../publish/publish-poller.service'
import { PublishService } from '../publish/publish.service'
import { OAuthService } from './oauth.service'
import { Orientation } from './adapters/platform.interface'

const channelA = 'UC' + 'a'.repeat(22)
const channelB = 'UC' + 'b'.repeat(22)

describe('YouTube account isolation', () => {
  let db: DataSource
  let accounts: YoutubeAccountService
  let publisher: PublishService
  let root: string
  let adapter: any
  let platforms: any
  let run: jest.SpyInstance
  beforeEach(async () => {
    db = await new DataSource({ type: 'better-sqlite3', database: ':memory:',
      entities: [YoutubeAccount, PublishTask, PublishRecord], synchronize: true }).initialize()
    root = mkdtempSync(join(tmpdir(), 'youtube-channel-test-'))
    mkdirSync(join(root, 'uploads/videos'), { recursive: true })
    writeFileSync(join(root, 'uploads/videos/test.mp4'), 'local test bytes only')
    jest.spyOn(process, 'cwd').mockReturnValue(root)
    platforms = { findByCode: jest.fn().mockResolvedValue({ code: 'youtube', enabled: true,
      appId: 'client-A', appSecret: 'secret-A', refreshToken: 'refresh-A' }), saveTokens: jest.fn() }
    adapter = { meta: new YoutubeAdapter().meta,
      identifyChannel: jest.fn().mockResolvedValue({ id: channelA, title: 'Channel A' }),
      identifyChannelWithToken: jest.fn(async (token) => ({ id: token === 'access-B' ? channelB : channelA,
        title: token === 'access-B' ? 'Channel B' : 'Channel A' })),
      publish: jest.fn().mockResolvedValue({ success: true, externalId: 'test-video' }) }
    accounts = new YoutubeAccountService(db.getRepository(YoutubeAccount), platforms, adapter)
    publisher = new PublishService(db.getRepository(PublishTask), db.getRepository(PublishRecord),
      platforms, { get: () => adapter } as any, { recordFromPublish: jest.fn() } as any, {} as any, accounts, {} as any)
    // Creation is exercised normally, but never starts background or real publication.
    run = jest.spyOn(publisher, 'runPublish').mockResolvedValue(undefined)
  })
  afterEach(async () => {
    jest.restoreAllMocks()
    await db.destroy()
    rmSync(root, { recursive: true, force: true })
  })
  async function twoAccounts() {
    const config = await platforms.findByCode('youtube')
    const a = await accounts.saveAuthorization(config, { accessToken: 'access-A', refreshToken: 'refresh-A' })
    const b = await accounts.saveAuthorization(config, { accessToken: 'access-B', refreshToken: 'refresh-B' })
    return { a, b }
  }
  const taskInput = (id?: string) => ({ title: 'Test', videoFilename: 'test.mp4', orientation: 'landscape' as const,
    width: 1920, height: 1080, videoHash: 'same-content', platforms: ['youtube'], youtubeAccountId: id })

  it('migrates legacy authorization once, then identifies it without replacing the credentials', async () => {
    await accounts.onApplicationBootstrap()
    await accounts.onApplicationBootstrap()
    const [pending] = await accounts.list()
    expect(pending.verified).toBe(false)
    await expect(accounts.resolve(pending.id)).rejects.toThrow('识别频道')
    await accounts.identify(pending.id)
    expect((await accounts.resolve(pending.id)).channelId).toBe(channelA)
    expect((await accounts.get(pending.id)).refreshToken).toBe('refresh-A')
    expect(await db.getRepository(YoutubeAccount).count()).toBe(1)
    expect(JSON.stringify(await accounts.list())).not.toMatch(/secret-A|refresh-A|access-A/)
  })
  it('adds a second channel independently and rejects reauthorization into a different channel', async () => {
    const { a, b } = await twoAccounts()
    await expect(accounts.saveAuthorization(await platforms.findByCode('youtube'),
      { accessToken: 'access-B', refreshToken: 'replacement' }, a.id)).rejects.toThrow('不一致')
    expect((await accounts.get(a.id)).refreshToken).toBe('refresh-A')
    expect((await accounts.get(b.id)).refreshToken).toBe('refresh-B')
    await accounts.saveAuthorization(await platforms.findByCode('youtube'), { accessToken: 'access-A' }, a.id)
    expect((await accounts.get(a.id)).refreshToken).toBe('refresh-A')
    await expect(accounts.saveAuthorization({ appId: 'other-client', appSecret: 'other-secret' } as any,
      { accessToken: 'access-A' }, a.id)).rejects.toThrow('刷新令牌')
  })
  it('requires an enabled, verified target before creating any YouTube task', async () => {
    const { a } = await twoAccounts()
    await expect(publisher.createAndPublish(taskInput())).rejects.toThrow('请选择')
    await accounts.update(a.id, { enabled: false })
    await expect(publisher.createAndPublish(taskInput(a.id))).rejects.toThrow('停用')
    expect(await db.getRepository(PublishTask).count()).toBe(0)
  })
  it('deduplicates per channel, keeps retry bound to its original account, and stops mismatched credentials', async () => {
    const { a, b } = await twoAccounts()
    const first = await publisher.createAndPublish(taskInput(a.id))
    await db.getRepository(PublishRecord).update({ taskId: first.id }, { status: 'success', mock: false })
    const duplicate = await publisher.createAndPublish(taskInput(a.id))
    expect((await publisher.findOne(duplicate.id)).records[0].status).toBe('skipped')
    const other = await publisher.createAndPublish(taskInput(b.id))
    const record = (await publisher.findOne(other.id)).records[0]
    expect(record.status).toBe('pending')
    expect(record.targetChannelId).toBe(channelB)
    await db.getRepository(PublishRecord).update(record.id, { status: 'failed' })
    await publisher.retry(other.id)
    expect((await publisher.findOne(other.id)).records[0].youtubeAccountId).toBe(b.id)
    run.mockRestore()
    await publisher.runPublish(other.id)
    expect(adapter.publish.mock.calls[0][1].refreshToken).toBe('refresh-B')
    expect(adapter.publish.mock.calls[0][1].extra.expectedChannelId).toBe(channelB)
    await expect(publisher.resolveRecordConfig({ ...record, targetChannelId: channelA })).rejects.toThrow('不一致')
    await expect(publisher.resolveRecordConfig({ platform: 'youtube' } as any)).rejects.toThrow('旧任务')
  })
  it('allows the same video for different channels in a batch but skips the same channel twice', async () => {
    const { a, b } = await twoAccounts()
    const result = await publisher.createBatch([taskInput(a.id), taskInput(b.id), taskInput(b.id)])
    expect(result.success).toBe(2)
    expect(result.results[2].message).toContain('批内重复')
  })
  it('binds playlists to tasks and rejects a mismatched playlist before creating a task', async () => {
    const { a } = await twoAccounts()
    adapter.validatePublishPlaylist = jest.fn().mockRejectedValueOnce(new Error('不属于目标频道'))
    await expect(publisher.createAndPublish({ ...taskInput(a.id), youtubePlaylistId: 'wrong-list' })).rejects.toThrow('不属于')
    expect(await db.getRepository(PublishTask).count()).toBe(0)
    adapter.validatePublishPlaylist.mockResolvedValue({ id: 'list-a', title: 'List A' })
    const result = await publisher.createBatch([{ ...taskInput(a.id), videoHash: 'one', youtubePlaylistId: 'list-a' },
      { ...taskInput(a.id), videoHash: 'two', youtubePlaylistId: 'list-a' }])
    const records = await db.getRepository(PublishRecord).find()
    expect(result.success).toBe(2)
    expect(records.map(r => r.youtubePlaylistId)).toEqual(['list-a', 'list-a'])
    expect(records[0].youtubePlaylistTitle).toBe('List A')
  })

  it('retries playlist failures without uploading the video again', async () => {
    const { a } = await twoAccounts()
    adapter.validatePublishPlaylist = jest.fn().mockResolvedValue({ id: 'list-a', title: 'List A' })
    adapter.addVideoToPlaylist = jest.fn().mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValue(undefined)
    adapter.queryStatus = jest.fn().mockResolvedValue({ status: 'success', message: '视频完成' })
    const task = await publisher.createAndPublish({ ...taskInput(a.id), youtubePlaylistId: 'list-a' })
    await db.getRepository(PublishRecord).update({ taskId: task.id }, { status: 'processing', externalId: 'uploaded-video' })
    const poller = new PublishPollerService(db.getRepository(PublishRecord), platforms,
      { get: () => adapter } as any, publisher, { get: () => undefined } as any)
    await poller.poll()
    expect((await publisher.findOne(task.id)).records[0].message).toContain('视频已上传，加入列表失败')
    await publisher.retry(task.id)
    run.mockRestore()
    await publisher.runPublish(task.id)
    await poller.poll()
    const record = (await publisher.findOne(task.id)).records[0]
    expect(record.status).toBe('success')
    expect(record.youtubePlaylistAdded).toBe(true)
    expect(record.externalId).toBe('uploaded-video')
    expect(adapter.publish).not.toHaveBeenCalled()
    expect(adapter.addVideoToPlaylist).toHaveBeenCalledTimes(2)
  })

  it('accepts portrait YouTube videos for single and batch publishing', async () => {
    const { a } = await twoAccounts()
    const portrait = { ...taskInput(a.id), orientation: 'portrait' as const, width: 1080, height: 1920 }
    const single = await publisher.createAndPublish(portrait)
    expect(single.orientation).toBe('portrait')
    expect((await publisher.findOne(single.id)).records[0].youtubeAccountId).toBe(a.id)
    const batch = await publisher.createBatch([{ ...portrait, videoHash: 'portrait-batch' },
      { ...taskInput(a.id), videoHash: 'landscape-batch' }])
    expect(batch.success).toBe(2)
    expect(adapter.publish).not.toHaveBeenCalled()
  })

  it('keeps OAuth client and reauthorization account bound to the original state', async () => {
    const { a } = await twoAccounts()
    adapter.buildAuthUrl = ({ state }) => 'https://example.test/?state=' + state
    adapter.exchangeCode = jest.fn().mockResolvedValue({ accessToken: 'access-A', refreshToken: 'new-A' })
    const oauth = new OAuthService({ get: () => adapter } as any, platforms, { get: () => undefined } as any, accounts, {} as any, {} as any)
    const { url } = await oauth.buildAuthUrl('youtube', a.id)
    const state = new URL(url).searchParams.get('state')
    await expect(oauth.handleCallback('tiktok', { state, code: 'auth-code' })).rejects.toThrow('不匹配')
    platforms.findByCode.mockResolvedValue({ appId: 'changed-client', appSecret: 'changed-secret' })
    await oauth.handleCallback('youtube', { state, code: 'auth-code' })
    expect(adapter.exchangeCode.mock.calls[0][0].config.appId).toBe('client-A')
    expect((await accounts.get(a.id)).refreshToken).toBe('new-A')
    expect(platforms.saveTokens).not.toHaveBeenCalled()
    await expect(oauth.handleCallback('youtube', { state, code: 'auth-code' })).rejects.toThrow('state')
  })
})

describe('YouTube upload target preflight', () => {
  afterEach(() => jest.restoreAllMocks())
  it('does not start an upload when Google identifies a different channel', async () => {
    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'test-token' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: channelB, snippet: { title: 'B' } }] })))
    const result = await new YoutubeAdapter().publish({ title: 'test', filePath: 'must-not-read', fileName: 'test.mp4',
      size: 1, mime: 'video/mp4', orientation: Orientation.LANDSCAPE },
    { code: 'youtube', enabled: true, appId: 'client', appSecret: 'secret', refreshToken: 'refresh', extra: { expectedChannelId: channelA } } as any)
    expect(result.success).toBe(false)
    expect(result.message).toContain('不一致')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes('/upload/'))).toBe(true)
  })
  it('does not report another channel video as a successful publication', async () => {
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'test-token' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ snippet: { channelId: channelB }, status: { uploadStatus: 'processed' } }] })))
    const result = await new YoutubeAdapter().queryStatus({ externalId: 'test', pollCount: 1,
      config: { appId: 'client', appSecret: 'secret', refreshToken: 'refresh', extra: { expectedChannelId: channelA } } as any })
    expect(result.status).toBe('failed')
  })
})
