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
import { codeChallenge, postForm, readFileChunks, sleep } from './http.util'

// TikTok 频道视频信息（用于「TikTok 视频」栏目）
export interface TiktokVideo {
  id: string
  title: string
  description: string
  cover: string
  url: string
  createTime: string
  duration: number // 秒
  width: number
  height: number
  viewCount?: number
  likeCount?: number
  commentCount?: number
  shareCount?: number
}

// 抖音海外版 TikTok 适配器（窄屏）
// 官方接口：TikTok Content Posting API
// 流程：video/init（FILE_UPLOAD）→ 顺序 PUT 分片 → status/fetch 轮询发布状态
// 文档：https://developers.tiktok.com/doc/content-posting-api-get-started
@Injectable()
export class TiktokAdapter implements IPlatformAdapter {
  readonly code = PlatformCode.TIKTOK
  readonly meta = PLATFORMS.find((p) => p.code === this.code)!
  readonly requiresPkce = true // TikTok 强制 PKCE

  // TikTok 只要有 accessToken 即可（access_token 有效期约 24h，过期需刷新）
  isConfigured(config: PlatformConfigLike): boolean {
    return !!config.accessToken
  }

  async publish(input: PublishVideoInput, config: PlatformConfigLike): Promise<PublishResult> {
    if (!this.isConfigured(config)) {
      await sleep(1500)
      return makeMockResult(this.code, input.title)
    }
    try {
      return await this.realPublish(input, config)
    } catch (e: any) {
      return { success: false, message: `TikTok 发布失败：${e.message}` }
    }
  }

  private async realPublish(input: PublishVideoInput, config: PlatformConfigLike): Promise<PublishResult> {
    const token = config.accessToken!
    const base = 'https://open.tiktokapis.com'
    const chunkSize = 10 * 1024 * 1024 // TikTok 推荐分片 10MB
    const totalChunkCount = Math.ceil(input.size / chunkSize)

    // 1. 初始化上传会话
    const initRes = await fetch(`${base}/v2/post/publish/video/init/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_info: { title: input.title, privacy_level: 'PUBLIC_TO_EVERYONE' },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: input.size,
          chunk_size: chunkSize,
          total_chunk_count: totalChunkCount,
        },
      }),
    })
    const initData: any = await initRes.json()
    const publishId = initData?.data?.publish_id
    const uploadUrl = initData?.data?.upload_url
    if (!uploadUrl) {
      throw new Error('初始化失败：' + JSON.stringify(initData))
    }

    // 2. 顺序 PUT 每个分片（需携带 Content-Range，流式读取避免整文件进内存）
    let offset = 0
    for await (const chunk of readFileChunks(input.filePath, chunkSize)) {
      const end = offset + chunk.length - 1
      await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': input.mime || 'video/mp4',
          'Content-Range': `bytes ${offset}-${end}/${input.size}`,
        },
        body: chunk,
      })
      offset = end + 1
    }

    // 上传完成后，最终发布状态由轮询服务通过 status/fetch 查询并落库
    return {
      success: true,
      pending: true,
      externalId: publishId,
      message: 'TikTok 已上传，等待发布',
    }
  }

  // ---- 发布状态查询 ----
  async queryStatus({ externalId, config }: {
    externalId: string
    config: PlatformConfigLike
    pollCount: number
  }) {
    const res = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.accessToken!}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ publish_id: externalId }),
    })
    const data: any = await res.json()
    const status = data?.data?.status
    if (status === 'PUBLISH_COMPLETE') {
      const postId = data?.data?.publically_available_post_id
      return {
        status: 'success' as const,
        externalUrl: postId ? `https://www.tiktok.com/@user/video/${postId}` : '',
        message: 'TikTok 发布完成',
      }
    }
    if (status === 'FAILED') {
      return { status: 'failed' as const, message: 'TikTok 发布失败' }
    }
    return { status: 'processing' as const, message: `TikTok 处理中（${status || 'unknown'}）` }
  }

  // ---- 视频列表 ----

  // 获取可用 access_token：优先用 refreshToken 刷新，退回已存 accessToken
  private async getAccessToken(config: PlatformConfigLike): Promise<string> {
    if (config.refreshToken) {
      const data = await postForm('https://open.tiktokapis.com/v2/oauth/token/', {
        client_key: config.appId!,
        client_secret: config.appSecret!,
        grant_type: 'refresh_token',
        refresh_token: config.refreshToken!,
      })
      if (data.access_token) return data.access_token
    }
    if (config.accessToken) return config.accessToken
    throw new Error('TikTok 未授权，请先在「平台配置」完成授权')
  }

  // 获取当前授权账号已发布的视频（倒序，带封面）
  async listUserVideos(config: PlatformConfigLike): Promise<TiktokVideo[]> {
    const accessToken = await this.getAccessToken(config)
    const base = 'https://open.tiktokapis.com'

    const raw: any[] = []
    let cursor = 0
    const MAX_PAGES = 50 // 每页最多 20 条，安全上限 1000 条
    for (let i = 0; i < MAX_PAGES; i++) {
      const res = await fetch(`${base}/v2/video/list/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_count: 20, cursor }),
      })
      const data: any = await res.json()
      if (data?.error?.code && data.error.code !== 'ok') {
        throw new Error(`TikTok 获取视频列表失败：${data.error.message || data.error.code}`)
      }
      const list = data?.data?.videos || []
      raw.push(...list)
      if (!data?.data?.has_more) break
      cursor = Number(data?.data?.cursor || 0)
      if (!cursor) break
    }

    // 组装（封面转 base64，前端直接展示，避免浏览器连不上 TikTok 图床）
    return await Promise.all(
      raw.map(async (v) => ({
        id: v.id || '',
        title: v.title || '',
        description: v.video_description || '',
        cover: await this.coverToBase64(v.cover_image_url || ''),
        url: v.share_url || (v.id ? `https://www.tiktok.com/@user/video/${v.id}` : ''),
        createTime: v.create_time ? new Date(v.create_time * 1000).toISOString() : '',
        duration: Number(v.duration || 0),
        width: Number(v.width || 0),
        height: Number(v.height || 0),
        viewCount: Number(v.view_count || 0) || undefined,
        likeCount: Number(v.like_count || 0) || undefined,
        commentCount: Number(v.comment_count || 0) || undefined,
        shareCount: Number(v.share_count || 0) || undefined,
      })),
    )
  }

  // 把封面 URL 拉取为 base64 data URL
  private async coverToBase64(url: string): Promise<string> {
    if (!url) return ''
    try {
      const res = await fetch(url)
      if (!res.ok) return ''
      const buf = Buffer.from(await res.arrayBuffer())
      return `data:image/jpeg;base64,${buf.toString('base64')}`
    } catch {
      return ''
    }
  }

  // ---- OAuth2 授权码流程（TikTok，PKCE） ----

  buildAuthUrl({ state, redirectUri, codeVerifier, config }: {
    state: string
    redirectUri: string
    codeVerifier?: string
    config: PlatformConfigLike
  }): string {
    const params = new URLSearchParams({
      client_key: config.appId!,
      response_type: 'code',
      scope: 'video.publish,video.list',
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge(codeVerifier!),
      code_challenge_method: 'S256',
    })
    return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`
  }

  async exchangeCode({ code, redirectUri, codeVerifier, config }: {
    code: string
    redirectUri: string
    codeVerifier?: string
    config: PlatformConfigLike
  }) {
    const data = await postForm('https://open.tiktokapis.com/v2/oauth/token/', {
      client_key: config.appId!,
      client_secret: config.appSecret!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: codeVerifier!,
    })
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      openId: data.open_id,
      expiresIn: data.expires_in,
    }
  }

  async refresh(config: PlatformConfigLike) {
    const data = await postForm('https://open.tiktokapis.com/v2/oauth/token/', {
      client_key: config.appId!,
      client_secret: config.appSecret!,
      grant_type: 'refresh_token',
      refresh_token: config.refreshToken!,
    })
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    }
  }
}
