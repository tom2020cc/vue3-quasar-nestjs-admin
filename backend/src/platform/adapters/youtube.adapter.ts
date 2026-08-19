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
import { postForm, readFileBuffer, sleep } from './http.util'

// 油管频道视频信息（用于「油管视频」栏目）
export interface YoutubeVideo {
  id: string
  title: string
  description: string
  channelTitle: string
  thumbnail: string
  url: string
  publishedAt: string
  duration: number // 秒
  definition: string // hd / sd
  privacyStatus: string // public / private / unlisted
  viewCount?: number
  likeCount?: number
  commentCount?: number
}

// 将 YouTube 的 ISO 8601 时长（如 PT1M30S / PT1H2M3S）解析为秒
function parseIsoDuration(iso: string): number {
  if (!iso) return 0
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/)
  if (!m) return 0
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)
}

// 油管 YouTube 适配器（宽屏）
// 官方接口：YouTube Data API v3 —— 可恢复上传（resumable upload）
// 文档：https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol
@Injectable()
export class YoutubeAdapter implements IPlatformAdapter {
  readonly code = PlatformCode.YOUTUBE
  readonly meta = PLATFORMS.find((p) => p.code === this.code)!
  readonly requiresPkce = false // 服务端应用使用 client_secret，无需 PKCE

  // 油管必须有 refreshToken 才算配置完成（发布时再实时换 access_token）
  isConfigured(config: PlatformConfigLike): boolean {
    return !!config.refreshToken
  }

  async publish(input: PublishVideoInput, config: PlatformConfigLike): Promise<PublishResult> {
    if (!this.isConfigured(config)) {
      await sleep(1500)
      return makeMockResult(this.code, input.title)
    }
    try {
      return await this.realPublish(input, config)
    } catch (e: any) {
      return { success: false, message: `油管发布失败：${e.message}` }
    }
  }

  private async realPublish(input: PublishVideoInput, config: PlatformConfigLike): Promise<PublishResult> {
    // 1. 用 refresh_token 换取 access_token
    //    POST https://oauth2.googleapis.com/token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.appId!,
        client_secret: config.appSecret!,
        refresh_token: config.refreshToken!,
        grant_type: 'refresh_token',
      }),
    })
    const tokenData: any = await tokenRes.json()
    if (!tokenData.access_token) {
      throw new Error('获取 access_token 失败：' + JSON.stringify(tokenData))
    }
    const accessToken = tokenData.access_token

    // 2. 发起可恢复上传，获取上传地址（响应头 Location）
    const metadata = {
      snippet: { title: input.title, description: input.description || '' },
      status: { privacyStatus: 'public' },
    }
    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadata),
      },
    )
    const uploadUrl = initRes.headers.get('location')
    if (!uploadUrl) {
      throw new Error('未获取到上传地址：' + (await initRes.text()))
    }

    // 3. 将视频字节 PUT 到上传地址
    const buf = await readFileBuffer(input.filePath)
    const upRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': input.mime || 'video/mp4' },
      body: buf,
    })
    const video: any = await upRes.json()

    return {
      success: true,
      pending: true, // 上传完成，仍需等待转码处理
      externalId: video.id,
      externalUrl: `https://youtu.be/${video.id}`,
      message: '油管上传完成，等待转码处理',
    }
  }

  // ---- 发布状态查询 ----
  async queryStatus({ externalId, config }: {
    externalId: string
    config: PlatformConfigLike
    pollCount: number
  }) {
    // 先刷新 access_token，再查询视频状态
    const tokenRes = await postForm('https://oauth2.googleapis.com/token', {
      client_id: config.appId!,
      client_secret: config.appSecret!,
      refresh_token: config.refreshToken!,
      grant_type: 'refresh_token',
    })
    const accessToken = tokenRes.access_token
    if (!accessToken) {
      return { status: 'processing' as const, message: '获取 access_token 失败' }
    }
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails&id=${externalId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    const data: any = await res.json()
    const item = data?.items?.[0]
    if (!item) {
      return { status: 'processing' as const, message: '视频尚未就绪' }
    }
    const processingStatus = item.processingDetails?.processingStatus
    const uploadStatus = item.status?.uploadStatus
    if (processingStatus === 'succeeded' || uploadStatus === 'processed') {
      return {
        status: 'success' as const,
        externalUrl: `https://youtu.be/${externalId}`,
        message: '油管发布完成',
      }
    }
    if (
      ['failed', 'rejected', 'terminated'].includes(processingStatus) ||
      ['failed', 'rejected'].includes(uploadStatus)
    ) {
      return { status: 'failed' as const, message: `油管处理失败：${processingStatus || uploadStatus}` }
    }
    return { status: 'processing' as const, message: `油管处理中（${processingStatus || uploadStatus}）` }
  }

  // ---- 频道视频列表 ----

  // 用 refresh_token 换取 access_token（各接口复用）
  private async refreshAccessToken(config: PlatformConfigLike): Promise<string> {
    const data = await postForm('https://oauth2.googleapis.com/token', {
      client_id: config.appId!,
      client_secret: config.appSecret!,
      refresh_token: config.refreshToken!,
      grant_type: 'refresh_token',
    })
    if (!data.access_token) {
      throw new Error('获取 access_token 失败：' + JSON.stringify(data))
    }
    return data.access_token
  }

  // 获取当前授权账号频道下的所有视频信息
  async listChannelVideos(config: PlatformConfigLike): Promise<YoutubeVideo[]> {
    const accessToken = await this.refreshAccessToken(config)

    // 1. 取频道「上传」播放列表 ID
    const chRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    const chData: any = await chRes.json()
    if (!chRes.ok) {
      throw new Error(`获取频道信息失败：${chData?.error?.message || chRes.status}`)
    }
    const uploadsPlaylist = chData?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
    if (!uploadsPlaylist) {
      throw new Error('未找到频道「上传」播放列表，请确认该账号已创建频道')
    }

    // 2. 翻页拉取上传列表（每页 50 条，带安全上限）
    const items: any[] = []
    let pageToken: string | undefined
    const MAX_PAGES = 100
    for (let i = 0; i < MAX_PAGES; i++) {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails',
        playlistId: uploadsPlaylist,
        maxResults: '50',
      })
      if (pageToken) params.set('pageToken', pageToken)
      const plRes = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      const plData: any = await plRes.json()
      if (!plRes.ok) {
        throw new Error(`获取视频列表失败：${plData?.error?.message || plRes.status}`)
      }
      items.push(...(plData.items || []))
      pageToken = plData.nextPageToken
      if (!pageToken) break
    }

    // 3. 按 50 个一批补齐统计与时长信息
    const videoIds = items.map((it) => it.contentDetails?.videoId).filter(Boolean) as string[]
    const statsMap: Record<string, any> = {}
    for (let i = 0; i < videoIds.length; i += 50) {
      const ids = videoIds.slice(i, i + 50).join(',')
      const vRes = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics,status&id=${ids}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      const vData: any = await vRes.json()
      if (vRes.ok && vData.items) {
        for (const v of vData.items) statsMap[v.id] = v
      }
    }

    // 4. 组装基础信息（封面先取中等清晰度 URL，随后转 base64，避免浏览器直连 i.ytimg.com 被墙）
    const list = items.map((it) => {
      const id = it.contentDetails?.videoId || ''
      const psnippet = it.snippet || {} // 上传列表的 snippet（描述可能被截断）
      const detail = statsMap[id] || {}
      const vsnippet = detail.snippet || psnippet // videos.list 的完整 snippet
      const t = vsnippet.thumbnails || psnippet.thumbnails || {}
      // 封面优先取最高清晰度：maxres(1280x720) → standard(640x480) → high(480x360) → medium(320x180) → default(120x90)
      const coverUrl =
        t.maxres?.url || t.standard?.url || t.high?.url || t.medium?.url || t.default?.url || ''
      return {
        id,
        title: vsnippet.title || psnippet.title || '',
        description: vsnippet.description || psnippet.description || '',
        channelTitle: vsnippet.channelTitle || psnippet.channelTitle || '',
        coverUrl,
        url: `https://youtu.be/${id}`,
        publishedAt: vsnippet.publishedAt || psnippet.publishedAt || '',
        duration: parseIsoDuration(detail.contentDetails?.duration || ''),
        definition: detail.contentDetails?.definition || '',
        privacyStatus: detail.status?.privacyStatus || '',
        viewCount: Number(detail.statistics?.viewCount || 0) || undefined,
        likeCount: Number(detail.statistics?.likeCount || 0) || undefined,
        commentCount: Number(detail.statistics?.commentCount || 0) || undefined,
      }
    })

    // 5. 封面转 base64 后随接口一起返回，前端无需直连油管图床
    return await Promise.all(
      list.map(async ({ coverUrl, ...v }) => ({
        ...v,
        thumbnail: await this.thumbnailToBase64(coverUrl),
      })),
    )
  }

  // 把封面 URL 拉取为 base64 data URL（前端直接展示，避免浏览器连不上油管图床）
  private async thumbnailToBase64(url: string): Promise<string> {
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

  // ---- OAuth2 授权码流程（Google OAuth2） ----

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
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
      access_type: 'offline', // 必须，用于换取 refresh_token
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  async exchangeCode({ code, redirectUri, config }: {
    code: string
    redirectUri: string
    codeVerifier?: string
    config: PlatformConfigLike
  }) {
    const data = await postForm('https://oauth2.googleapis.com/token', {
      client_id: config.appId!,
      client_secret: config.appSecret!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    })
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    }
  }

  async refresh(config: PlatformConfigLike) {
    const data = await postForm('https://oauth2.googleapis.com/token', {
      client_id: config.appId!,
      client_secret: config.appSecret!,
      refresh_token: config.refreshToken!,
      grant_type: 'refresh_token',
    })
    return { accessToken: data.access_token, expiresIn: data.expires_in }
  }
}
