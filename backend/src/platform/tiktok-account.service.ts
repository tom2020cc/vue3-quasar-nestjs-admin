import { BadRequestException, Injectable, NotFoundException, OnApplicationBootstrap } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { randomUUID } from 'crypto'
import { TiktokAccount } from './entities/tiktok-account.entity'
import { PlatformConfigService } from './platform-config.service'
import { TiktokAdapter } from './adapters/tiktok.adapter'
import { OAuthTokenResult, PlatformConfigLike } from './adapters/platform.interface'

@Injectable()
export class TiktokAccountService implements OnApplicationBootstrap {
  private refreshing = new Map<string, Promise<void>>()
  constructor(
    @InjectRepository(TiktokAccount) private readonly repo: Repository<TiktokAccount>,
    private readonly platforms: PlatformConfigService,
    private readonly adapter: TiktokAdapter,
  ) {}
  async onApplicationBootstrap() {
    if (await this.repo.count()) return
    const old = await this.platforms.findByCode('tiktok')
    if (old?.appId && old.appSecret && old.refreshToken) {
      await this.repo.save(this.repo.create({ id: randomUUID(), openId: old.openId || null,
        displayName: '', label: '原有 TikTok 账号', enabled: true, appId: old.appId,
        appSecret: old.appSecret, accessToken: old.accessToken, refreshToken: old.refreshToken,
        tokenExpiresAt: old.tokenExpiresAt }))
    }
  }
  publicInfo(a: TiktokAccount) {
    return { id: a.id, openId: a.openId, displayName: a.displayName, label: a.label,
      enabled: a.enabled, verified: !!a.openId, hasCredential: !!a.refreshToken,
      tokenExpiresAt: a.tokenExpiresAt }
  }
  async list() { return (await this.repo.find({ order: { createTime: 'ASC' } })).map(a => this.publicInfo(a)) }
  async get(id: string) {
    if (!id) throw new BadRequestException('请选择 TikTok 目标账号')
    const a = await this.repo.findOneBy({ id })
    if (!a) throw new NotFoundException('TikTok 账号不存在，请重新选择')
    return a
  }
  config(a: TiktokAccount): PlatformConfigLike {
    return { code: 'tiktok', name: a.displayName || a.label, enabled: a.enabled,
      appId: a.appId, appSecret: a.appSecret, accessToken: a.accessToken,
      refreshToken: a.refreshToken, openId: a.openId, tokenExpiresAt: a.tokenExpiresAt }
  }
  async resolve(id: string, expectedOpenId?: string, expectedAppId?: string) {
    const a = await this.get(id)
    if (!a.enabled) throw new BadRequestException('该 TikTok 账号已停用')
    if (!a.openId) throw new BadRequestException('请先在账号管理中识别账号或重新授权')
    if (!a.appId || !a.appSecret || !a.refreshToken) throw new BadRequestException('TikTok 授权不完整，请重新授权')
    if ((expectedOpenId && expectedOpenId !== a.openId) || (expectedAppId && expectedAppId !== a.appId)) {
      throw new BadRequestException('任务绑定的 TikTok 账号与当前授权不一致，已停止发布')
    }
    return a
  }
  async update(id: string, patch: { label?: string; enabled?: boolean }) {
    const a = await this.get(id)
    await this.repo.update(a.id, patch)
    return this.publicInfo(await this.get(id))
  }
  private async refreshAccount(id: string) {
    const a = await this.get(id)
    const tokens = await this.adapter.refresh(this.config(a))
    if (!tokens.accessToken || !tokens.openId || (a.openId && tokens.openId !== a.openId)) {
      throw new BadRequestException('TikTok 刷新返回的账号不一致，请重新授权')
    }
    // Do not overwrite credentials saved by a concurrent OAuth callback/import.
    const result = await this.repo.update({ id, refreshToken: a.refreshToken, appId: a.appId }, {
      accessToken: tokens.accessToken, refreshToken: tokens.refreshToken || a.refreshToken,
      openId: tokens.openId, tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
    })
    if (!result.affected) throw new BadRequestException('账号授权已更新，请重试')
  }
  async readyConfig(id: string, expectedOpenId?: string, expectedAppId?: string, forceRefresh = false): Promise<PlatformConfigLike> {
    let a = await this.resolve(id, expectedOpenId, expectedAppId)
    if (forceRefresh || !a.accessToken || !a.tokenExpiresAt || a.tokenExpiresAt.getTime() < Date.now() + 300000) {
      if (!this.refreshing.has(id)) {
        this.refreshing.set(id, this.refreshAccount(id).finally(() => this.refreshing.delete(id)))
      }
      await this.refreshing.get(id)
      a = await this.resolve(id, expectedOpenId, expectedAppId)
    }
    // Token rotation is owned by this service, never the stateless video adapter.
    return { ...this.config(a), refreshToken: null }
  }
  async identify(id: string) {
    let a = await this.get(id)
    if (!a.openId) { await this.refreshAccount(id); a = await this.get(id) }
    const config = await this.readyConfig(id)
    const profile = await this.adapter.identifyUser(config.accessToken!)
    if (profile.openId !== a.openId) throw new BadRequestException('TikTok 凭证与账号不一致，请重新授权')
    await this.repo.update({ id, openId: a.openId }, { displayName: profile.displayName })
    return this.publicInfo(await this.get(id))
  }
  async saveAuthorization(config: PlatformConfigLike, tokens: OAuthTokenResult, expectedId?: string) {
    if (!tokens.accessToken || !tokens.refreshToken || !tokens.openId) throw new BadRequestException('TikTok 未返回完整授权，请重新授权')
    let a = expectedId ? await this.get(expectedId) : await this.repo.findOneBy({ appId: config.appId, openId: tokens.openId })
    if (a && (a.appId !== config.appId || (a.openId && a.openId !== tokens.openId))) {
      throw new BadRequestException('重新授权选择了其他 TikTok 账号，原账号未改变；请使用「添加账号」')
    }
    if (!a) a = await this.repo.findOneBy({ appId: config.appId, refreshToken: tokens.refreshToken })
    if (a?.openId && a.openId !== tokens.openId) throw new BadRequestException('TikTok 授权身份不一致')
    let displayName = a?.displayName || ''
    try {
      const profile = await this.adapter.identifyUser(tokens.accessToken)
      if (profile.openId !== tokens.openId) throw new BadRequestException('TikTok 授权身份不一致')
      displayName = profile.displayName
    } catch (e) {
      if (e instanceof BadRequestException) throw e
      // Existing grants may omit user.info.basic. The token response still binds open_id.
    }
    try {
      return this.publicInfo(await this.repo.save(this.repo.create({ ...a, id: a?.id || randomUUID(),
        openId: tokens.openId, displayName, label: a?.label || '', enabled: a?.enabled ?? true,
        appId: config.appId, appSecret: config.appSecret, accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken, tokenExpiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null })))
    } catch { throw new BadRequestException('TikTok 账号保存失败，可能已经添加；请刷新账号列表') }
  }
}
