import { Injectable } from '@nestjs/common'
import {
  IPlatformAdapter,
  PlatformCode,
  PlatformConfigLike,
  PublishResult,
  PublishVideoInput,
  PLATFORMS,
  makeMockResult,
} from './platform.interface'
import { postForm, sleep } from './http.util'
import { META_GRAPH } from './meta.util'

const INSTAGRAM_GRAPH = 'https://graph.instagram.com'
const INSTAGRAM_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish']

// Instagram 适配器（竖屏 Reels）
// 官方接口：Instagram Content Publishing API
// 流程：建容器（video_url + media_type=REELS）→ 轮询 status_code → media_publish
// 文档：https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing
@Injectable()
export class InstagramAdapter implements IPlatformAdapter {
  readonly code = PlatformCode.INSTAGRAM
  readonly meta = PLATFORMS.find((p) => p.code === this.code)!
  readonly requiresPkce = false
  readonly requiresPublicUrl = true // 视频必须提供公网 URL，不能直传二进制

  // Existing Facebook Login credentials keep their original host; new authorizations use Instagram Login.
  private graph(config: PlatformConfigLike) {
    return config.extra?.authType === 'instagram_login' ? INSTAGRAM_GRAPH : META_GRAPH
  }

  private async json(url: string, init?: RequestInit) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) })
    let data: any
    try { data = await response.json() } catch { throw new Error(`Instagram 返回无效响应（HTTP ${response.status}）`) }
    if (!response.ok || data?.error || data?.error_message) {
      // Avoid persisting raw responses that can include credentials or authorization codes.
      throw new Error(`Instagram 请求失败（HTTP ${response.status}，错误码 ${data?.error?.code || data?.code || 'unknown'}），请核对应用、权限与令牌`)
    }
    return data
  }

  // 需 igUserId + accessToken 才算配置完成
  isConfigured(config: PlatformConfigLike): boolean {
    const igUserId = config.openId || config.extra?.igUserId
    return !!igUserId && !!config.accessToken
  }

  async publish(input: PublishVideoInput, config: PlatformConfigLike): Promise<PublishResult> {
    if (!this.isConfigured(config)) {
      await sleep(1500)
      return makeMockResult(this.code, input.title)
    }
    if (!input.publicUrl) {
      return { success: false, message: 'Instagram 发布失败：缺少视频公网 URL（对象存储未托管）' }
    }
    const igUserId = config.openId || config.extra?.igUserId
    const token = config.accessToken
    try {
      return await this.realPublish(input, String(igUserId), String(token), this.graph(config))
    } catch (e: any) {
      return { success: false, message: `Instagram 发布失败：${e.message}` }
    }
  }

  private async realPublish(
    input: PublishVideoInput,
    igUserId: string,
    token: string,
    graph: string,
  ): Promise<PublishResult> {
    // 1. 创建媒体容器（Reels，用对象存储公网 URL）
    const data = await postForm(`${graph}/${igUserId}/media`, {
      media_type: 'REELS',
      video_url: input.publicUrl!,
      caption: [input.title, input.description].filter(Boolean).join('\n\n'),
      access_token: token,
    })
    const containerId = data?.id
    if (!containerId) {
      throw new Error('创建媒体容器失败：' + JSON.stringify(data))
    }
    return {
      success: true,
      pending: true,
      externalId: containerId,
      message: 'Instagram 容器已创建，等待就绪后发布',
    }
  }

  // ---- 发布状态查询 ----
  async queryStatus({ externalId, config }: {
    externalId: string
    config: PlatformConfigLike
    pollCount: number
  }) {
    const token = config.accessToken!
    const igUserId = config.openId || config.extra?.igUserId

    const graph = this.graph(config)
    const data = await this.json(`${graph}/${externalId}?fields=status_code`, { headers: { Authorization: `Bearer ${token}` } })
    const status = data?.status_code

    if (status === 'FINISHED') {
      // 容器就绪 → 正式发布
      try {
        const pubData = await postForm(`${graph}/${igUserId}/media_publish`, {
          creation_id: externalId,
          access_token: token,
        })
        const mediaId = pubData?.id
        if (!mediaId) throw new Error('发布接口未返回媒体编号，请核对 Instagram 结果')
        // Numeric media IDs are not Instagram shortcodes. Fetch the actual permalink.
        let permalink = ''
        try {
          const media = await this.json(`${graph}/${mediaId}?fields=permalink`, { headers: { Authorization: `Bearer ${token}` } })
          if (typeof media.permalink === 'string' && /^https:\/\/www\.instagram\.com\/(p|reel)\//.test(media.permalink)) permalink = media.permalink
        } catch { /* Publication already succeeded; a link lookup failure must not trigger a second upload. */ }
        return {
          status: 'success' as const,
          externalUrl: permalink,
          message: 'Instagram 发布完成',
        }
      } catch (e: any) {
        return { status: 'failed' as const, message: `Instagram 发布失败：${e.message}` }
      }
    }
    if (status === 'PUBLISHED') {
      return { status: 'success' as const, message: 'Instagram 发布完成' }
    }
    if (status === 'IN_PROGRESS') {
      return { status: 'processing' as const, message: 'Instagram 处理中' }
    }
    if (status === 'ERROR' || status === 'EXPIRED') {
      return { status: 'failed' as const, message: `Instagram 处理失败（${status}）` }
    }
    return { status: 'processing' as const, message: `Instagram 处理中（${status || 'unknown'}）` }
  }

  // ---- OAuth2 授权码流程（Meta Instagram Login） ----

  buildAuthUrl({ state, redirectUri, config }: {
    state: string
    redirectUri: string
    codeVerifier?: string
    config: PlatformConfigLike
  }): string {
    const params = new URLSearchParams({
      client_id: config.appId!,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: INSTAGRAM_SCOPES.join(','),
      enable_fb_login: '0',
      force_authentication: '1',
      state,
    })
    return `https://www.instagram.com/oauth/authorize?${params.toString()}`
  }

  async exchangeCode({ code, redirectUri, config }: {
    code: string
    redirectUri: string
    codeVerifier?: string
    config: PlatformConfigLike
  }) {
    const form = new FormData()
    for (const [key, value] of Object.entries({ client_id: config.appId!, client_secret: config.appSecret!, grant_type: 'authorization_code', redirect_uri: redirectUri, code })) form.set(key, value)
    const response = await this.json('https://api.instagram.com/oauth/access_token', { method: 'POST', body: form })
    const short = response.access_token ? response : Array.isArray(response.data) && response.data.length === 1 ? response.data[0] : null
    if (!short?.access_token) throw new Error('Instagram 未返回唯一访问令牌，请重新授权')
    if (short.permissions) {
      const granted = Array.isArray(short.permissions) ? short.permissions : String(short.permissions).split(',')
      if (INSTAGRAM_SCOPES.some(scope => !granted.includes(scope))) throw new Error('请同时授予 Instagram 基本资料和内容发布权限')
    }
    const long = await this.json(`${INSTAGRAM_GRAPH}/access_token?${new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: config.appSecret!, access_token: short.access_token })}`)
    if (!long.access_token || !Number.isFinite(Number(long.expires_in)) || Number(long.expires_in) <= 0) throw new Error('Instagram 长期令牌获取失败，请重新授权')
    const ig = await this.json(`${INSTAGRAM_GRAPH}/me?fields=user_id,username`, { headers: { Authorization: `Bearer ${long.access_token}` } })
    if (!ig.user_id || !ig.username) throw new Error('未识别到 Instagram 专业账号，请确认是创作者或企业账号')

    return {
      accessToken: long.access_token,
      openId: String(ig.user_id),
      expiresIn: Number(long.expires_in),
      extra: { authType: 'instagram_login', igUserId: String(ig.user_id), username: ig.username, pageId: null, pageAccessToken: null },
    }
  }

  async refresh(config: PlatformConfigLike) {
    if (config.extra?.authType !== 'instagram_login' || !config.accessToken) throw new Error('请先通过 Instagram 直接授权；旧 Facebook 令牌不能在此刷新')
    const result = await this.json(`${INSTAGRAM_GRAPH}/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: config.accessToken })}`)
    if (!result.access_token || !Number.isFinite(Number(result.expires_in)) || Number(result.expires_in) <= 0) throw new Error('Instagram 令牌刷新失败，请重新授权')
    return { accessToken: result.access_token, expiresIn: Number(result.expires_in) }
  }
}
