import { Injectable } from '@nestjs/common'
import { createHash } from 'crypto'
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
import { stat } from 'fs/promises'
import { TIKTOK_PRIVACY_LEVELS, tiktokError } from './tiktok-privacy'
import { readTiktokChunks, tiktokUploadPlan } from './tiktok-upload'

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
  readonly requiresPkce = true // 本地 Desktop Login Kit 要求 PKCE

  // TikTok 只要有 accessToken 即可（access_token 有效期约 24h，过期需刷新）
  isConfigured(config: PlatformConfigLike): boolean {
    return !!config.accessToken
  }

  async publish(input: PublishVideoInput, config: PlatformConfigLike): Promise<PublishResult> {
    if (!this.isConfigured(config)) {
      await sleep(1500)
      return makeMockResult(this.code, input.title)
    }
    let externalId: string | undefined
    try {
      return await this.realPublish({ ...input, onUploadSession: async id => {
        externalId = id
        await input.onUploadSession?.(id)
      } }, config)
    } catch (e: any) {
      return { success: false, externalId, message: `TikTok 发布失败：${e.message}${externalId ? '；上传编号已保留，请检查平台状态，勿重复上传' : ''}` }
    }
  }

  private async realPublish(input: PublishVideoInput, config: PlatformConfigLike): Promise<PublishResult> {
    const token = config.accessToken!
    const base = 'https://open.tiktokapis.com'
    const { chunkSize, totalChunkCount } = tiktokUploadPlan(input.size)
    if ((await stat(input.filePath)).size !== input.size) throw new Error('视频大小发生变化，请重新上传本地文件')

    const creator = await this.creatorInfo(config)
    if (!input.tiktokPrivacyLevel || !creator.privacyLevels.includes(input.tiktokPrivacyLevel)) {
      throw new Error('请选择该账号允许的 TikTok 可见性；旧任务请在重试设置中选择')
    }
    if (!Number.isFinite(input.duration) || input.duration <= 0) throw new Error('缺少有效视频时长，请重新选择视频')
    if (input.duration > creator.maxDuration) throw new Error(`视频超过该账号允许的 ${creator.maxDuration} 秒`)

    // 1. 初始化上传会话
    const initRes = await fetch(`${base}/v2/post/publish/video/init/`, {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_info: { title: input.title, privacy_level: input.tiktokPrivacyLevel, disable_comment: true, disable_duet: true, disable_stitch: true },
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
    if (!initRes.ok || (initData?.error?.code && initData.error.code !== 'ok') || !uploadUrl || !publishId) {
      throw new Error(`初始化失败：${tiktokError(String(initData?.error?.code || initRes.status), initData?.error?.message || '未获得上传会话')}`)
    }

    // Persist the remote session before any bytes leave the server.
    await input.onUploadSession?.(publishId)

    // 2. 顺序 PUT 每个分片（需携带 Content-Range，流式读取避免整文件进内存）
    for await (const { buffer: chunk, offset, final } of readTiktokChunks(input.filePath, input.size)) {
      const end = offset + chunk.length - 1
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        signal: AbortSignal.timeout(300000),
        headers: {
          'Content-Type': input.mime || 'video/mp4',
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${offset}-${end}/${input.size}`,
        },
        body: chunk,
      })
      const expectedStatus = final ? 201 : 206
      if (uploadRes.status !== expectedStatus) {
        throw new Error(`分片上传失败：HTTP ${uploadRes.status}（字节 ${offset}–${end}），未完成上传`)
      }
    }

    // 上传完成后，最终发布状态由轮询服务通过 status/fetch 查询并落库
    return {
      success: true,
      pending: true,
      externalId: publishId,
      message: 'TikTok 已上传，等待发布',
    }
  }

  async creatorInfo(config: PlatformConfigLike) {
    const res = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
      method: 'POST', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
    })
    const result: any = await res.json()
    if (!res.ok || result.error?.code !== 'ok') throw new Error(tiktokError(String(result.error?.code || res.status), result.error?.message))
    const data = result.data
    if (!Array.isArray(data?.privacy_level_options) || !Number.isFinite(data.max_video_post_duration_sec) || data.max_video_post_duration_sec <= 0) throw new Error('TikTok 返回的发布设置无效，请稍后重试')
    return {
      nickname: String(data.creator_nickname || ''), username: String(data.creator_username || ''),
      privacyLevels: data.privacy_level_options.filter((v: string) => TIKTOK_PRIVACY_LEVELS.includes(v as any)) as string[],
      maxDuration: data.max_video_post_duration_sec as number,
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
      signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${config.accessToken!}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ publish_id: externalId }),
    })
    const data: any = await res.json()
    if (!res.ok || data?.error?.code !== 'ok') {
      throw new Error(tiktokError(String(data?.error?.code || res.status), data?.error?.message))
    }
    const status = data?.data?.status
    if (status === 'PUBLISH_COMPLETE') {
      const ids = data?.data?.publicaly_available_post_id || data?.data?.publically_available_post_id
      const postId = Array.isArray(ids) ? ids[0] : ids
      return {
        status: 'success' as const,
        externalUrl: postId ? `https://www.tiktok.com/@user/video/${postId}` : '',
        message: 'TikTok 发布完成',
      }
    }
    if (status === 'FAILED') {
      return { status: 'failed' as const, message: `TikTok 发布失败：${tiktokError(data?.data?.fail_reason || 'unknown')}` }
    }
    const messages = {
      PROCESSING_UPLOAD: 'TikTok 等待上传完成；如传输已中断，本次检查不会重新上传文件',
      PROCESSING_DOWNLOAD: 'TikTok 正在下载视频，等待平台处理',
      SEND_TO_USER_INBOX: '视频已送达 TikTok 收件箱，需在 TikTok 中完成发布；尚未发布成功',
    }
    if (!messages[status]) throw new Error('TikTok 返回未知发布状态，请稍后检查')
    return { status: 'processing' as const, message: messages[status] }
  }

  // ---- 视频列表 ----

  async identifyUser(accessToken: string) {
    const res = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data: any = await res.json()
    if (!res.ok || (data.error?.code && data.error.code !== 'ok') || !data.data?.user?.open_id) {
      throw new Error('无法读取 TikTok 账号资料，请重新授权并同意基本资料权限')
    }
    return { openId: data.data.user.open_id as string, displayName: String(data.data.user.display_name || '') }
  }

  // 获取当前授权账号已发布的视频（倒序，带封面）
  async listUserVideos(config: PlatformConfigLike): Promise<TiktokVideo[]> {
    const accessToken = config.accessToken
    if (!accessToken) throw new Error('TikTok 未授权，请在账号管理中重新授权')
    const base = 'https://open.tiktokapis.com'

    const raw: any[] = []
    const fields = 'id,title,video_description,cover_image_url,share_url,create_time,duration,width,height,view_count,like_count,comment_count,share_count'
    let cursor = 0
    const MAX_PAGES = 50 // 每页最多 20 条，安全上限 1000 条
    for (let i = 0; i < MAX_PAGES; i++) {
      const res = await fetch(`${base}/v2/video/list/?fields=${fields}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }),
      })
      const data: any = await res.json()
      if (data?.error?.code && data.error.code !== 'ok') {
        throw new Error(`TikTok 获取视频列表失败：${data.error.message || data.error.code}`)
      }
      if (!res.ok) throw new Error(`TikTok 获取视频列表失败：HTTP ${res.status}`)
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
    if (!codeVerifier) throw new Error('TikTok 授权缺少 PKCE 校验码，请重新发起授权')
    const params = new URLSearchParams({
      client_key: config.appId!,
      response_type: 'code',
      scope: 'user.info.basic,video.publish,video.list',
      redirect_uri: redirectUri,
      state,
      // TikTok Desktop 使用 SHA256 十六进制编码，与通用 base64url 实现不同。
      // https://developers.tiktok.com/docs/en/login-kit-desktop
      code_challenge: createHash('sha256').update(codeVerifier).digest('hex'),
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
    if (data.error || !data.access_token || !data.open_id || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in) <= 0) {
      throw new Error('TikTok 令牌获取失败，请检查应用配置并重新授权')
    }
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
    if (data.error || !data.access_token || !data.open_id || !Number.isFinite(Number(data.expires_in)) || Number(data.expires_in) <= 0) {
      throw new Error('TikTok 令牌获取失败，请检查应用配置并重新授权')
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      openId: data.open_id,
      expiresIn: data.expires_in,
    }
  }
}
