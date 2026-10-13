import { BadRequestException, Injectable, NotFoundException, OnApplicationBootstrap } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { randomUUID } from 'crypto'
import { YoutubeAccount } from './entities/youtube-account.entity'
import { PlatformConfigService } from './platform-config.service'
import { YoutubeAdapter } from './adapters/youtube.adapter'
import { OAuthTokenResult, PlatformConfigLike } from './adapters/platform.interface'

@Injectable()
export class YoutubeAccountService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(YoutubeAccount) private readonly repo: Repository<YoutubeAccount>,
    private readonly platforms: PlatformConfigService,
    private readonly adapter: YoutubeAdapter,
  ) {}
  async onApplicationBootstrap() {
    if (await this.repo.count()) return
    const legacy = await this.platforms.findByCode('youtube')
    if (legacy?.appId && legacy.appSecret && legacy.refreshToken) {
      await this.repo.save(this.repo.create({
        id: randomUUID(), channelId: null, channelTitle: '', label: '原有 YouTube 账号',
        enabled: true, appId: legacy.appId, appSecret: legacy.appSecret,
        accessToken: legacy.accessToken, refreshToken: legacy.refreshToken,
        tokenExpiresAt: legacy.tokenExpiresAt,
      }))
    }
  }
  publicInfo(a: YoutubeAccount) {
    return { id: a.id, channelId: a.channelId, channelTitle: a.channelTitle, label: a.label,
      enabled: a.enabled, verified: !!a.channelId, hasCredential: !!a.appId && !!a.appSecret && !!a.refreshToken,
      tokenExpiresAt: a.tokenExpiresAt, updateTime: a.updateTime }
  }
  async list() { return (await this.repo.find({ order: { createTime: 'ASC' } })).map((a) => this.publicInfo(a)) }
  async get(id: string) {
    if (!id) throw new BadRequestException('请选择 YouTube 目标频道')
    const a = await this.repo.findOneBy({ id })
    if (!a) throw new NotFoundException('YouTube 账号不存在，请重新选择频道')
    return a
  }
  config(a: YoutubeAccount): PlatformConfigLike {
    return { code: 'youtube', name: a.channelTitle || a.label, enabled: a.enabled,
      appId: a.appId, appSecret: a.appSecret, accessToken: a.accessToken,
      refreshToken: a.refreshToken, tokenExpiresAt: a.tokenExpiresAt,
      extra: { expectedChannelId: a.channelId } }
  }
  async resolve(id: string, expectedChannelId?: string) {
    const a = await this.get(id)
    if (!a.enabled) throw new BadRequestException('该 YouTube 账号已停用')
    if (!a.channelId) throw new BadRequestException('请先在账号管理中点击「识别频道」')
    if (!a.appId || !a.appSecret || !a.refreshToken) throw new BadRequestException('频道授权不完整，请重新授权')
    if (expectedChannelId && a.channelId !== expectedChannelId) throw new BadRequestException('任务绑定的频道与当前授权不一致，已停止发布')
    return a
  }
  async update(id: string, patch: { label?: string; enabled?: boolean }) {
    const a = await this.get(id)
    if (patch.label !== undefined) a.label = patch.label
    if (patch.enabled !== undefined) a.enabled = patch.enabled
    return this.publicInfo(await this.repo.save(a))
  }
  async identify(id: string) {
    const a = await this.get(id)
    const channel = await this.adapter.identifyChannel(this.config(a))
    if (a.channelId && a.channelId !== channel.id) throw new BadRequestException('凭证对应的频道已改变，请重新授权')
    const duplicate = await this.repo.findOneBy({ channelId: channel.id })
    if (duplicate && duplicate.id !== a.id) throw new BadRequestException('此频道已存在，请使用现有频道账号')
    a.channelId = channel.id
    a.channelTitle = channel.title
    return this.publicInfo(await this.repo.save(a))
  }
  async saveAuthorization(config: PlatformConfigLike, tokens: OAuthTokenResult, expectedId?: string) {
    if (!tokens.accessToken) throw new BadRequestException('Google 未返回访问令牌，请重新授权')
    const channel = await this.adapter.identifyChannelWithToken(tokens.accessToken)
    let account = expectedId ? await this.get(expectedId) : await this.repo.findOneBy({ channelId: channel.id })
    if (account?.channelId && account.channelId !== channel.id) throw new BadRequestException('所选频道与重新授权的账号不一致，原账号保持不变；请使用「添加账号」')
    // Reuse an unidentified migrated account only when the refresh credential matches exactly.
    if (!account && tokens.refreshToken) account = await this.repo.findOneBy({ refreshToken: tokens.refreshToken, appId: config.appId })
    if (account?.channelId && account.channelId !== channel.id) throw new BadRequestException('授权频道不一致')
    const refreshToken = tokens.refreshToken || (account?.channelId === channel.id && account.appId === config.appId ? account.refreshToken : null)
    if (!refreshToken) throw new BadRequestException('未获得刷新令牌，请重新同意授权；已有账号未改变')
    const saved = this.repo.create({ ...account, id: account?.id || randomUUID(),
      channelId: channel.id, channelTitle: channel.title, label: account?.label || '',
      enabled: account?.enabled ?? true, appId: config.appId, appSecret: config.appSecret,
      accessToken: tokens.accessToken, refreshToken,
      tokenExpiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null })
    try { return this.publicInfo(await this.repo.save(saved)) }
    catch { throw new BadRequestException('频道保存失败，该频道可能已有账号；请刷新列表后重试') }
  }
}
