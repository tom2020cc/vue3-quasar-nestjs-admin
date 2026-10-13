import { TiktokAccountService } from './tiktok-account.service'
import { BadRequestException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PlatformConfigService } from './platform-config.service'
import { PlatformAdapterFactory } from './adapters/platform-adapter.factory'
import { YoutubeAccountService } from './youtube-account.service'
import { PlatformConfigLike } from './adapters/platform.interface'
import {
  generateCodeVerifier,
  randomState,
} from './adapters/http.util'

// OAuth 授权状态存储：key 为 state，value 为平台编码与 PKCE 校验码
// 使用内存存储（单实例足够），state 10 分钟过期
interface OAuthState {
  platform: string
  codeVerifier?: string
  createdAt: number
  accountId?: string
  config: PlatformConfigLike
}

@Injectable()
export class OAuthService {
  private states = new Map<string, OAuthState>()

  constructor(
    private readonly factory: PlatformAdapterFactory,
    private readonly configService: PlatformConfigService,
    private readonly env: ConfigService,
    private readonly youtubeAccounts: YoutubeAccountService,
    private readonly tiktokAccounts: TiktokAccountService,
  ) {}

  // 后端对外的基地址（用于生成回调地址，需在各平台控制台登记为「回调域名」）
  private get backendBase(): string {
    return this.env.get<string>('BACKEND_BASE_URL') || 'http://localhost:5001'
  }

  // 前端地址（授权完成后跳回前端）
  get frontendUrl(): string {
    return this.env.get<string>('FRONTEND_URL') || 'http://localhost:5173'
  }

  // 回调地址：/platform/:code/oauth/callback
  redirectUri(code: string): string {
    return `${this.backendBase}/platform/${code}/oauth/callback`
  }

  // 生成授权跳转地址
  async buildAuthUrl(code: string, accountId?: string): Promise<{ url: string }> {
    const adapter = this.factory.get(code)
    if (!adapter) throw new BadRequestException('未知平台')
    if (accountId && !['youtube', 'tiktok'].includes(code)) throw new BadRequestException('该平台不支持多账号')
    const accounts = code === 'tiktok' ? this.tiktokAccounts : this.youtubeAccounts
    const config = accountId
      ? accounts.config(await accounts.get(accountId) as any)
      : await this.configService.findByCode(code)
    if (!config || !config.appId || !config.appSecret) {
      throw new BadRequestException('请先在「平台配置」中填写 appId 与 appSecret')
    }

    const state = randomState()
    let codeVerifier: string | undefined
    if (adapter.requiresPkce) {
      codeVerifier = generateCodeVerifier()
    }
    for (const [key, value] of this.states) if (Date.now() - value.createdAt > 600000) this.states.delete(key)
    this.states.set(state, { platform: code, codeVerifier, createdAt: Date.now(), accountId, config: { ...config } })

    const url = adapter.buildAuthUrl({
      state,
      redirectUri: this.redirectUri(code),
      codeVerifier,
      config,
    })
    return { url }
  }

  // 处理授权回调：校验 state → 授权码换令牌 → 保存到平台配置，返回平台编码
  async handleCallback(code: string, query: {
    code?: string
    state?: string
    error?: string
    error_description?: string
  }): Promise<string> {
    if (query.error) {
      throw new BadRequestException(`授权被拒绝：${query.error_description || query.error}`)
    }
    if (!query.state || !this.states.has(query.state)) {
      throw new BadRequestException('state 无效或已过期，请重新发起授权')
    }
    const st = this.states.get(query.state)!
    if (st.platform !== code) throw new BadRequestException('授权回调平台不匹配')
    if (Date.now() - st.createdAt > 10 * 60 * 1000) {
      this.states.delete(query.state)
      throw new BadRequestException('state 已过期，请重新发起授权')
    }
    this.states.delete(query.state)
    if (!query.code) {
      throw new BadRequestException('缺少授权码 code')
    }

    const adapter = this.factory.get(st.platform)
    if (!adapter) throw new BadRequestException('未知平台')
    const config = st.config
    if (!config || !config.appId || !config.appSecret) {
      throw new BadRequestException('请先配置 appId 与 appSecret')
    }

    const result = await adapter.exchangeCode({
      code: query.code,
      redirectUri: this.redirectUri(st.platform),
      codeVerifier: st.codeVerifier,
      config,
    })
    if (st.platform === 'youtube') {
      await this.youtubeAccounts.saveAuthorization(config, result, st.accountId)
    } else if (st.platform === 'tiktok') {
      await this.tiktokAccounts.saveAuthorization(config, result, st.accountId)
    } else {
      await this.configService.saveTokens(st.platform, result)
    }
    return st.platform
  }

  // 用 refresh_token 刷新访问令牌
  async refresh(code: string) {
    if (code === 'tiktok') throw new BadRequestException('TikTok 按账号自动刷新令牌；失效时请在多账号管理中重新授权')
    if (code === 'youtube') throw new BadRequestException('YouTube 按频道自动刷新令牌；授权失效时请在账号管理中重新授权')
    const adapter = this.factory.get(code)
    if (!adapter || !adapter.refresh) {
      throw new BadRequestException('该平台不支持刷新令牌')
    }
    const config = await this.configService.findByCode(code)
    if (!config || !(code === 'instagram' ? config.accessToken && config.extra?.authType === 'instagram_login' : config.refreshToken)) {
      if (code === 'instagram') throw new BadRequestException('请先通过 Instagram 直接授权')
      throw new BadRequestException('未配置 refreshToken，请先完成授权')
    }
    const result = await adapter.refresh(config)
    await this.configService.saveTokens(code, result)
    return { msg: '刷新成功' }
  }
}
