import { TiktokAccount } from './entities/tiktok-account.entity'
import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { parse } from 'dotenv'
import { LocalConfigService, CONFIG_FILENAME } from './local-config.service'
import { LocalConfigController } from './local-config.controller'
import { validateDocument } from './local-config.schema'
import { PlatformConfig } from './entities/platform-config.entity'
import { YoutubeAccount } from './entities/youtube-account.entity'

const doc = (parts: Record<string, any>) => ({ format: 'video-platform-local-config', version: 1, ...parts })

describe('Local configuration import and backup', () => {
  let root: string
  let source: DataSource
  let service: LocalConfigService
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'platform-config-test-'))
    mkdirSync(join(root, 'backend'))
    mkdirSync(join(root, 'frontend'))
    writeFileSync(join(root, 'backend/.env'), 'JWT_SECRET=original-test-secret\nBACKEND_PORT=5001\nCUSTOM_SETTING=keep-me\n')
    writeFileSync(join(root, 'frontend/.env'), 'VITE_API_BASE_URL=http://localhost:5001\n')
    source = new DataSource({ type: 'better-sqlite3', database: join(root, 'backend/test.sqlite'), entities: [PlatformConfig, YoutubeAccount, TiktokAccount], synchronize: true })
    await source.initialize()
    await source.getRepository(PlatformConfig).save({ code: 'youtube', name: 'YouTube', enabled: true, appSecret: 'old-secret', refreshToken: 'keep-token', tokenExpiresAt: new Date('2026-10-07T10:00:00.000Z'), extra: { channel: 'test' } })
    service = new LocalConfigService(source)
    Object.defineProperty(service, 'root', { value: root })
  })
  afterEach(async () => {
    await source.destroy()
    rmSync(root, { recursive: true, force: true })
  })
  it('round-trips a full backup, including tokens and ISO expiry, without exposing secrets in responses', async () => {
    const frontendBefore = readFileSync(join(root, 'frontend/.env'), 'utf8')
    const saved = await service.saveBackup()
    const full = JSON.parse(readFileSync(join(root, CONFIG_FILENAME), 'utf8'))
    expect(full.platforms[0].refreshToken).toBe('keep-token')
    expect(full.platforms[0].tokenExpiresAt).toBe('2026-10-07T10:00:00.000Z')
    expect(validateDocument(full)).toEqual(full)
    const preview = service.preview(full)
    const imported = await service.importConfig(full)
    expect(imported.restartRequired).toBe(false)
    expect(readFileSync(join(root, 'frontend/.env'), 'utf8')).toBe(frontendBefore)
    expect(JSON.stringify([saved, preview, imported])).not.toContain('keep-token')
    expect(JSON.stringify([saved, preview, imported])).not.toContain('original-test-secret')
    expect(await source.getRepository(PlatformConfig).count()).toBe(1)
  })
  it('merges provided fields, preserves omitted fields, clears explicit nulls, and saves recovery', async () => {
    const result = await service.importConfig(doc({ platforms: [{ code: 'youtube', appSecret: 'new-secret', extra: null }] }))
    const current = await source.getRepository(PlatformConfig).findOneBy({ code: 'youtube' })
    expect(current.appSecret).toBe('new-secret')
    expect(current.refreshToken).toBe('keep-token')
    expect(current.extra).toBeNull()
    const recovery = JSON.parse(readFileSync(join(root, result.recoveryFile), 'utf8'))
    expect(recovery.platforms[0].appSecret).toBe('old-secret')
    expect(current.tokenExpiresAt.toISOString()).toBe('2026-10-07T10:00:00.000Z')
  })
  it('writes environment values literally, preserves unrelated settings and reports restart', async () => {
    const special = 'test-secret-#-$-\\-"-value'
    const result = await service.importConfig(doc({ backendEnv: { JWT_SECRET: special, HTTPS_PROXY: 'http://127.0.0.1:7890' } }))
    const env = parse(readFileSync(join(root, 'backend/.env')))
    expect(env.JWT_SECRET).toBe(special)
    expect(env.CUSTOM_SETTING).toBe('keep-me')
    expect(result.restartRequired).toBe(true)
  })
  it('rolls back SQLite and all environment files on a write failure', async () => {
    const original = readFileSync(join(root, 'backend/.env'), 'utf8')
    const atomicWrite = (service as any).atomicWrite.bind(service)
    let failed = false
    jest.spyOn(service as any, 'atomicWrite').mockImplementation((file: string, content: any) => {
      if (file.endsWith(CONFIG_FILENAME) && !failed) { failed = true; throw new Error('simulated I/O failure with sensitive data') }
      return atomicWrite(file, content)
    })
    await expect(service.importConfig(doc({ platforms: [{ code: 'youtube', appSecret: 'new-secret' }], backendEnv: { BACKEND_PORT: '5002' } }))).rejects.toThrow('原配置已保留')
    expect(readFileSync(join(root, 'backend/.env'), 'utf8')).toBe(original)
    expect((await source.getRepository(PlatformConfig).findOneBy({ code: 'youtube' })).appSecret).toBe('old-secret')
  })
  it('rejects malformed files before making any changes', async () => {
    const invalid = [
      { version: 9 }, doc({ platforms: [{ code: 'unknown' }] }),
      doc({ platforms: [{ code: 'youtube' }, { code: 'youtube' }] }),
      doc({ backendEnv: { NODE_OPTIONS: '--require malicious.js' } }),
      doc({ backendEnv: { HTTP_PROXY: 'file:///tmp/example' } }),
      doc({ backendEnv: { JWT_SECRET: 'long-secret\nNODE_OPTIONS=bad' } }),
      doc({ backendEnv: { DB_DATABASE: 'different.sqlite' } }),
      doc({ platforms: [{ code: 'youtube', enabled: 'false' }] }),
      doc({ platforms: [{ code: 'youtube', tokenExpiresAt: 'bad-date' }] }),
      JSON.parse('{"format":"video-platform-local-config","version":1,"platforms":[{"code":"youtube","extra":{"__proto__":{"admin":true}}}]}'),
    ]
    for (const input of invalid) await expect(service.importConfig(input)).rejects.toThrow()
    expect((await source.getRepository(PlatformConfig).findOneBy({ code: 'youtube' })).appSecret).toBe('old-secret')
  })
  it('rejects non-local requests even if forwarded headers claim localhost', () => {
    const controller = new LocalConfigController(service)
    expect(() => controller.preview({ socket: { remoteAddress: '10.0.0.1' }, headers: { 'x-forwarded-for': '127.0.0.1' } } as any, doc({ platforms: [{ code: 'youtube' }] }))).toThrow('本机')
  })
  it('round-trips multiple accounts and matches existing channels without changing record IDs', async () => {
    const repo = source.getRepository(YoutubeAccount)
    const first = { id: '11111111-1111-4111-a111-111111111111', channelId: 'UC' + 'a'.repeat(22),
      channelTitle: 'A', label: 'First', enabled: true, appId: 'client', appSecret: 'test-secret-A',
      accessToken: null, refreshToken: 'test-refresh-A', tokenExpiresAt: null }
    const second = { ...first, id: '22222222-2222-4222-a222-222222222222', channelId: 'UC' + 'b'.repeat(22),
      channelTitle: 'B', refreshToken: 'test-refresh-B' }
    await repo.save(repo.create([first, second]))
    await service.saveBackup()
    const full = JSON.parse(readFileSync(join(root, CONFIG_FILENAME), 'utf8'))
    expect(full.version).toBe(3)
    expect(full.youtubeAccounts).toHaveLength(2)
    expect(JSON.stringify(service.preview(full))).not.toContain('test-refresh')
    await service.importConfig(full)
    // An exported account from another installation can have a different local UUID.
    await service.importConfig(doc({ version: 2, youtubeAccounts: [{ ...first,
      id: '33333333-3333-4333-a333-333333333333', refreshToken: 'updated-A' }] }))
    expect((await repo.findOneBy({ channelId: first.channelId })).id).toBe(first.id)
    expect((await repo.findOneBy({ id: first.id })).refreshToken).toBe('updated-A')
    expect((await repo.findOneBy({ id: second.id })).refreshToken).toBe('test-refresh-B')
    // A saved task UUID must never be rebound to another channel by import.
    await expect(service.importConfig(doc({ version: 2, youtubeAccounts: [{ ...first,
      channelId: second.channelId }] }))).rejects.toThrow('原配置已保留')
    expect((await repo.findOneBy({ id: first.id })).channelId).toBe(first.channelId)
  })
  it('imports legacy credentials as an unidentified account without overwriting existing channels', async () => {
    const repo = source.getRepository(YoutubeAccount)
    await repo.save({ id: '11111111-1111-4111-a111-111111111111', channelId: 'UC' + 'a'.repeat(22),
      channelTitle: 'Existing', label: '', enabled: true, appId: 'other-client', appSecret: 'other-secret', refreshToken: 'other-refresh' })
    await service.importConfig(doc({ platforms: [{ code: 'youtube', appId: 'legacy-client' }] }))
    const migrated = await repo.findOneBy({ appId: 'legacy-client' })
    expect(migrated.channelId).toBeNull()
    expect(migrated.refreshToken).toBe('keep-token')
    expect((await repo.findOneBy({ channelId: 'UC' + 'a'.repeat(22) })).refreshToken).toBe('other-refresh')
  })
  it('round-trips TikTok accounts, merges by app and open ID, and rejects identity conflicts atomically', async () => {
    const repo = source.getRepository(TiktokAccount)
    const a = await repo.save(repo.create({ id: '11111111-1111-4111-8111-111111111111', openId: 'open-A', displayName: 'A',
      label: '', enabled: true, appId: 'app', appSecret: 'secret', accessToken: 'token-A', refreshToken: 'refresh-A', tokenExpiresAt: null }))
    const snapshot = await service.snapshot()
    expect(snapshot.version).toBe(3)
    expect(snapshot.tiktokAccounts).toHaveLength(1)
    await service.importConfig(doc({ version: 3, tiktokAccounts: [{ ...snapshot.tiktokAccounts[0],
      id: '22222222-2222-4222-8222-222222222222', label: 'renamed' }] }))
    expect(await repo.count()).toBe(1)
    expect((await repo.findOneBy({ id: a.id })).label).toBe('renamed')
    await expect(service.importConfig(doc({ version: 3, tiktokAccounts: [{ ...snapshot.tiktokAccounts[0], openId: 'other' }] }))).rejects.toThrow('冲突')
    expect((await repo.findOneBy({ id: a.id })).openId).toBe('open-A')
    expect(JSON.stringify(service.preview(snapshot))).not.toMatch(/refresh-A|token-A|secret/)
  })
  it('imports v2 single TikTok credentials without overwriting an existing account', async () => {
    const legacy = { code: 'tiktok', appId: 'app', appSecret: 'secret', openId: 'open-A', accessToken: 'token-A', refreshToken: 'refresh-A' }
    await service.importConfig(doc({ version: 2, platforms: [legacy] }))
    await service.importConfig(doc({ version: 2, platforms: [{ ...legacy, accessToken: 'older-token' }] }))
    const accounts = await source.getRepository(TiktokAccount).find()
    expect(accounts).toHaveLength(1)
    expect(accounts[0].accessToken).toBe('token-A')
  })

})
