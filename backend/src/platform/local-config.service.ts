import { TiktokAccount } from './entities/tiktok-account.entity'
import { BadRequestException, ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { resolve, join } from 'path'
import { randomUUID } from 'crypto'
import { parse } from 'dotenv'
import { PlatformConfig } from './entities/platform-config.entity'
import { YoutubeAccount } from './entities/youtube-account.entity'
import { PLATFORMS } from './adapters/platform.interface'
import { BACKEND_KEYS, FRONTEND_KEYS, PLATFORM_KEYS, YOUTUBE_ACCOUNT_KEYS, TIKTOK_ACCOUNT_KEYS, LocalConfigDocument, envValue, validateDocument } from './local-config.schema'

export const CONFIG_FILENAME = 'local-config.private.json'
const INSTRUCTIONS = [
  '版本 3 包含 tiktokAccounts 多账号授权，按应用及 open_id 合并；保留已有账号 ID 和未列出的账号。',
  '本文件含真实应用密钥、授权令牌及登录签名密钥，仅在本机保管；已由 .gitignore 排除。不要强制加入 Git 或复制到公开目录。',
  '在「平台配置 → 导入配置」选择本文件。未提供的字段保持不变，null 或空字符串会清空对应平台字段。extra 对象整体替换。',
  '平台凭证导入后立即生效；环境变量需重启前后端。JWT 密钥变化后需要重新登录；修改地址需同步修改 Google 等平台的回调地址。',
  '本文件不包含数据库中的用户、菜单、发布记录或视频文件。DB_DATABASE 仅允许与当前数据库位置一致，迁移数据应另行复制数据库及上传目录。',
  '代理参数只配置本项目的启动进程，不会更改系统代理、代理软件订阅或虚拟网卡开关。代理端口应与本机代理软件一致。',
  '当前电脑曾使用：系统代理关闭、虚拟网卡（TUN）开启、规则模式。此说明仅供排查参考，其他电脑需按实际网络设置。',
  'OAuth 令牌可能过期或被撤销，导入不能替代平台授权；凭证更新后请再次点击「备份到根目录」。',
  '版本 2 包含 youtubeAccounts 多频道授权。按频道合并，已有账号 ID 保持不变，不删除未列出的账号。旧版本导入后请识别频道。',
]

@Injectable()
export class LocalConfigService {
  // src/platform and dist/platform share the same depth; independent of shell cwd.
  readonly root = resolve(__dirname, '../../..')
  private busy = false
  constructor(private readonly dataSource: DataSource) {}

  private envPath(side: string) { return join(this.root, side, '.env') }
  private readEnv(side: string) {
    const file = this.envPath(side)
    return existsSync(file) ? parse(readFileSync(file)) : {}
  }
  private selectEnv(side: string, keys: string[]) {
    const example = join(this.root, side, '.env.example')
    const env = { ...(existsSync(example) ? parse(readFileSync(example)) : {}), ...this.readEnv(side) }
    return Object.fromEntries(keys.filter((key) => env[key] !== undefined).map((key) => [key, env[key]]))
  }
  async snapshot(manager: EntityManager = this.dataSource.manager): Promise<LocalConfigDocument> {
    const configs = await manager.getRepository(PlatformConfig).find({ order: { code: 'ASC' } })
    const accounts = await manager.getRepository(YoutubeAccount).find({ order: { createTime: 'ASC' } })
    const tiktokAccounts = await manager.getRepository(TiktokAccount).find({ order: { createTime: 'ASC' } })
    return {
      format: 'video-platform-local-config', version: 3, exportedAt: new Date().toISOString(),
      instructions: INSTRUCTIONS,
      backendEnv: this.selectEnv('backend', BACKEND_KEYS),
      frontendEnv: this.selectEnv('frontend', FRONTEND_KEYS),
      platforms: configs.map((p) => Object.fromEntries(PLATFORM_KEYS.map((key) => [key, p[key] instanceof Date ? p[key].toISOString() : p[key] ?? null]))),
      tiktokAccounts: tiktokAccounts.map((a) => Object.fromEntries(TIKTOK_ACCOUNT_KEYS.map((key) => [key, a[key] instanceof Date ? a[key].toISOString() : a[key] ?? null]))),
      youtubeAccounts: accounts.map((a) => Object.fromEntries(YOUTUBE_ACCOUNT_KEYS.map((key) => [key, a[key] instanceof Date ? a[key].toISOString() : a[key] ?? null]))),
    }
  }
  private assertDatabase(doc: LocalConfigDocument) {
    if (doc.backendEnv?.DB_DATABASE !== undefined) {
      const current = String((this.dataSource.options as any).database)
      const requested = resolve(this.root, 'backend', doc.backendEnv.DB_DATABASE)
      if (requested !== resolve(current)) throw new BadRequestException('不能通过导入切换数据库文件；请保留当前 DB_DATABASE，数据库数据需单独迁移')
    }
  }
  preview(input: unknown) {
    const doc = validateDocument(input)
    this.assertDatabase(doc)
    const envChanges = (side: string, env: Record<string, string> = {}) => {
      const current = this.readEnv(side)
      return Object.keys(env).filter((key) => current[key] !== env[key])
    }
    return {
      platforms: (doc.platforms || []).map((p) => ({ code: p.code, name: PLATFORMS.find((m) => m.code === p.code)!.name, fields: Object.keys(p).filter((k) => k !== 'code') })),
      tiktokAccounts: (doc.tiktokAccounts || []).map((a) => ({ openId: a.openId, name: a.label || a.displayName || '待识别账号' })),
      youtubeAccounts: (doc.youtubeAccounts || []).map((a) => ({ channelId: a.channelId, name: a.label || a.channelTitle || '待识别频道' })),
      backendKeys: Object.keys(doc.backendEnv || {}), frontendKeys: Object.keys(doc.frontendEnv || {}),
      restartRequired: envChanges('backend', doc.backendEnv).length > 0 || envChanges('frontend', doc.frontendEnv).length > 0,
    }
  }
  private atomicWrite(file: string, content: string | Buffer) {
    const temp = file + '.' + randomUUID() + '.tmp'
    try {
      writeFileSync(temp, content, { mode: 0o600, flag: 'wx' })
      renameSync(temp, file)
    } finally {
      if (existsSync(temp)) unlinkSync(temp)
    }
  }
  private json(doc: LocalConfigDocument) { return JSON.stringify(doc, null, 2) + '\n' }
  private saveRecovery(doc: LocalConfigDocument) {
    const dir = join(this.root, '.private-config')
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const name = `before-import-${Date.now()}-${randomUUID()}.json`
    this.atomicWrite(join(dir, name), this.json(doc))
    return '.private-config/' + name
  }
  async saveBackup() {
    if (this.busy) throw new ConflictException('配置正在读写，请稍后重试')
    this.busy = true
    try {
      const doc = await this.snapshot()
      validateDocument(doc)
      this.atomicWrite(join(this.root, CONFIG_FILENAME), this.json(doc))
      return { filename: CONFIG_FILENAME, platformCount: doc.platforms.length, youtubeAccountCount: doc.youtubeAccounts.length, tiktokAccountCount: doc.tiktokAccounts.length, exportedAt: doc.exportedAt }
    } catch (e) {
      if (e instanceof BadRequestException) throw e
      throw new InternalServerErrorException('备份失败，请检查项目目录写入权限')
    } finally { this.busy = false }
  }
  async importConfig(input: unknown) {
    const summary = this.preview(input)
    const doc = input as LocalConfigDocument
    if (this.busy) throw new ConflictException('配置正在读写，请稍后重试')
    this.busy = true
    const originals = new Map<string, Buffer | null>()
    let recoveryFile: string
    try {
      // Save recoverable credentials before changing either SQLite or environment files.
      recoveryFile = this.saveRecovery(await this.snapshot())
      const files = [this.envPath('backend'), this.envPath('frontend'), join(this.root, CONFIG_FILENAME)]
      for (const file of files) originals.set(file, existsSync(file) ? readFileSync(file) : null)
      await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(PlatformConfig)
        for (const patch of doc.platforms || []) {
          const meta = PLATFORMS.find((p) => p.code === patch.code)!
          const current = await repo.findOneBy({ code: patch.code })
          const config = repo.create({ name: meta.name, enabled: meta.available !== false, ...current, ...patch })
          if (patch.tokenExpiresAt) config.tokenExpiresAt = new Date(patch.tokenExpiresAt)
          await repo.save(config)
        }
        const accounts = manager.getRepository(YoutubeAccount)
        for (const patch of doc.youtubeAccounts || []) {
          const byId = await accounts.findOneBy({ id: patch.id })
          if (byId?.channelId && byId.channelId !== patch.channelId) throw new BadRequestException('账号 ID 与原有频道冲突')
          const byChannel = patch.channelId ? await accounts.findOneBy({ channelId: patch.channelId }) : null
          if (byId && byChannel && byId.id !== byChannel.id) throw new BadRequestException('账号与频道映射冲突')
          const current = byChannel || byId
          await accounts.save(accounts.create({ ...current, ...patch, id: current?.id || patch.id,
            tokenExpiresAt: patch.tokenExpiresAt ? new Date(patch.tokenExpiresAt) : null }))
        }
        const tiktokAccounts = manager.getRepository(TiktokAccount)
        for (const patch of doc.tiktokAccounts || []) {
          const byId = await tiktokAccounts.findOneBy({ id: patch.id })
          if (byId?.openId && (byId.openId !== patch.openId || byId.appId !== patch.appId)) throw new BadRequestException('账号 ID 与原有TikTok 账号冲突')
          const byChannel = patch.openId ? await tiktokAccounts.findOneBy({ appId: patch.appId, openId: patch.openId }) : null
          if (byId && byChannel && byId.id !== byChannel.id) throw new BadRequestException('账号与TikTok 账号映射冲突')
          const current = byChannel || byId
          await tiktokAccounts.save(tiktokAccounts.create({ ...current, ...patch, id: current?.id || patch.id,
            tokenExpiresAt: patch.tokenExpiresAt ? new Date(patch.tokenExpiresAt) : null }))
        }
        // A v1 backup has only the original single-channel credential. Preserve it as an unidentified account.
        if (doc.version === 1 && doc.platforms?.some((p) => p.code === 'youtube')) {
          const legacy = await repo.findOneBy({ code: 'youtube' })
          if (legacy?.appId && legacy.appSecret && legacy.refreshToken && !await accounts.findOneBy({ appId: legacy.appId, refreshToken: legacy.refreshToken })) {
            await accounts.save(accounts.create({ id: randomUUID(), channelId: null, label: '旧备份导入账号', channelTitle: '', enabled: true,
              appId: legacy.appId, appSecret: legacy.appSecret, refreshToken: legacy.refreshToken,
              accessToken: legacy.accessToken, tokenExpiresAt: legacy.tokenExpiresAt }))
          }
        }
        if (doc.version < 3 && doc.platforms?.some(p => p.code === 'tiktok')) {
          const legacy = await repo.findOneBy({ code: 'tiktok' })
          if (legacy?.appId && legacy.appSecret && legacy.refreshToken) {
            const existing = legacy.openId
              ? await tiktokAccounts.findOneBy({ appId: legacy.appId, openId: legacy.openId })
              : await tiktokAccounts.findOneBy({ appId: legacy.appId, refreshToken: legacy.refreshToken })
            if (!existing) await tiktokAccounts.save(tiktokAccounts.create({ id: randomUUID(), openId: legacy.openId || null,
              displayName: '', label: '旧备份导入 TikTok 账号', enabled: true, appId: legacy.appId, appSecret: legacy.appSecret,
              accessToken: legacy.accessToken, refreshToken: legacy.refreshToken, tokenExpiresAt: legacy.tokenExpiresAt }))
          }
        }
        for (const [side, env] of [['backend', doc.backendEnv], ['frontend', doc.frontendEnv]] as const) {
          if (env && Object.keys(env).length) {
            const existing = this.readEnv(side)
            // Avoid restarting Vite's dev server when importing unchanged environment values.
            if (Object.entries(env).every(([key, value]) => existing[key] === value)) continue
            const merged = { ...existing, ...env }
            const content = '# Local configuration. Do not commit.\n' + Object.entries(merged).map(([key, value]) => `${key}=${envValue(value)}`).join('\n') + '\n'
            this.atomicWrite(this.envPath(side), content)
          }
        }
        this.atomicWrite(join(this.root, CONFIG_FILENAME), this.json(await this.snapshot(manager)))
      })
      return { ...summary, recoveryFile, filename: CONFIG_FILENAME }
    } catch (e) {
      let restored = true
      for (const [file, content] of originals) {
        try {
          if (content === null) { if (existsSync(file)) unlinkSync(file) }
          else this.atomicWrite(file, content)
        } catch { restored = false }
      }
      // Never return database errors which can contain token values in SQL parameters.
      if (restored && e instanceof BadRequestException) throw new BadRequestException(`${e.message}，原配置已保留`)
      throw new InternalServerErrorException(restored ? '导入失败，原配置已保留；请检查文件权限后重试' : '导入失败，环境文件恢复未完成；请使用 .private-config 中的导入前备份恢复')
    } finally { this.busy = false }
  }
}
