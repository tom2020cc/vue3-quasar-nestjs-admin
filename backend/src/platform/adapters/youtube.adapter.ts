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
  playlistItemId?: string
  unavailable?: boolean
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

export interface YoutubePlaylist {
  videoIds: string[]
  id: string
  title: string
  description: string
  thumbnail: string
  itemCount: number
  privacyStatus: string
  publishedAt: string
  url: string
}

// 将 YouTube 的 ISO 8601 时长（如 PT1M30S / PT1H2M3S）解析为秒
function parseIsoDuration(iso: string): number {
  if (!iso) return 0
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/)
  if (!m) return 0
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)
}

// 油管 YouTube 适配器（横屏、竖屏共用上传接口）
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

  async identifyChannelWithToken(accessToken: string): Promise<{ id: string; title: string }> {
    const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(20000),
    })
    const data: any = await response.json()
    if (!response.ok || data.items?.length !== 1 || !data.items[0].id) {
      throw new Error('无法唯一识别授权频道，请确认账号已创建频道，并重新选择频道授权')
    }
    return { id: data.items[0].id, title: data.items[0].snippet?.title || data.items[0].id }
  }

  async identifyChannel(config: PlatformConfigLike) {
    return this.identifyChannelWithToken(await this.refreshAccessToken(config))
  }

  private async assertTarget(accessToken: string, config: PlatformConfigLike) {
    if (!config.extra?.expectedChannelId) throw new Error('缺少目标频道，已停止操作')
    const channel = await this.identifyChannelWithToken(accessToken)
    if (channel.id !== config.extra.expectedChannelId) throw new Error('授权凭证与目标频道不一致，已停止操作')
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

    // Verify the exact upload token before opening an upload session. Never fall back to another account.
    await this.assertTarget(accessToken, config)

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

    if (!upRes.ok || !video.id) throw new Error('YouTube 上传未成功，请检查账号权限及配额')
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
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,status,processingDetails&id=${encodeURIComponent(externalId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    const data: any = await res.json()
    const item = data?.items?.[0]
    if (!item) {
      return { status: 'processing' as const, message: '视频尚未就绪' }
    }
    if (!config.extra?.expectedChannelId || item.snippet?.channelId !== config.extra.expectedChannelId) {
      return { status: 'failed' as const, message: '视频所属频道与任务目标不一致' }
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
  private async refreshAccessToken(config: PlatformConfigLike, playlistWrite = false): Promise<string> {
    const data = await postForm('https://oauth2.googleapis.com/token', {
      client_id: config.appId!,
      client_secret: config.appSecret!,
      refresh_token: config.refreshToken!,
      grant_type: 'refresh_token',
    })
    if (!data.access_token) {
      throw new Error('YouTube 授权已失效，请重新授权该频道')
    }
    if (playlistWrite && !String(data.scope || '').split(' ').some(scope =>
      ['https://www.googleapis.com/auth/youtube', 'https://www.googleapis.com/auth/youtube.force-ssl'].includes(scope))) {
      throw new Error('缺少播放列表管理权限，请到平台配置重新授权此 YouTube 频道后再试')
    }
    return data.access_token
  }

  private async ownedPlaylist(token: string, config: PlatformConfigLike, playlistId: string) {
    if (!/^[a-zA-Z0-9_-]{1,150}$/.test(playlistId)) throw new Error('无效的播放列表 ID')
    const data = await this.youtubeGet(token, 'playlists', { part: 'snippet', id: playlistId })
    const item = data.items?.[0]
    if (data.items?.length !== 1 || item.snippet?.channelId !== config.extra?.expectedChannelId) {
      throw new Error('播放列表不属于所选频道或已不可用，请刷新列表')
    }
    return { id: item.id, title: item.snippet.title }
  }

  async validatePublishPlaylist(config: PlatformConfigLike, playlistId: string) {
    const token = await this.refreshAccessToken(config, true)
    await this.assertTarget(token, config)
    return this.ownedPlaylist(token, config, playlistId)
  }

  private async youtubePost(token: string, resource: string, part: string, body: unknown) {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/${resource}?part=${part}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
    })
    const data: any = await res.json()
    if (!res.ok) throw new Error(`YouTube 播放列表操作失败：${data?.error?.message || res.status}`)
    if (!data.id) throw new Error('YouTube 未返回播放列表操作结果，请刷新后确认')
    return data
  }

  async createPlaylist(config: PlatformConfigLike, title: string, privacyStatus: string) {
    if (!title?.trim() || title.trim().length > 150) throw new Error('列表名称需为 1–150 个字符')
    if (!['private', 'unlisted', 'public'].includes(privacyStatus)) throw new Error('无效的可见范围')
    const token = await this.refreshAccessToken(config, true)
    await this.assertTarget(token, config)
    const item = await this.youtubePost(token, 'playlists', 'snippet,status', {
      snippet: { title: title.trim() }, status: { privacyStatus },
    })
    return { id: item.id, title: item.snippet?.title || title.trim(), privacyStatus }
  }

  async addVideoToPlaylist(config: PlatformConfigLike, playlistId: string, videoId: string) {
    const token = await this.refreshAccessToken(config, true)
    await this.assertTarget(token, config)
    await this.ownedPlaylist(token, config, playlistId)
    const video = await this.youtubeGet(token, 'videos', { part: 'snippet', id: videoId })
    if (video.items?.length !== 1 || video.items[0].snippet?.channelId !== config.extra?.expectedChannelId) {
      throw new Error('视频所属频道与任务目标不一致')
    }
    // A response may be lost after insertion. Check membership before retrying.
    const existing = await this.youtubeGet(token, 'playlistItems', { part: 'id', playlistId, videoId, maxResults: '1' })
    if (existing.items?.length) return
    await this.youtubePost(token, 'playlistItems', 'snippet', {
      snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } },
    })
  }

  private async youtubeGet(accessToken: string, resource: string, params: Record<string, string>) {
    const response = await fetch(`https://www.googleapis.com/youtube/v3/${resource}?${new URLSearchParams(params)}`, {
      headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30000),
    })
    const data: any = await response.json()
    if (!response.ok) throw new Error(`获取 YouTube 数据失败：${data?.error?.message || response.status}`)
    return data
  }

  async listChannelPlaylists(config: PlatformConfigLike, summaryOnly = false): Promise<YoutubePlaylist[]> {
    const token = await this.refreshAccessToken(config)
    await this.assertTarget(token, config)
    const result: (YoutubePlaylist & { coverUrl: string })[] = []
    let pageToken = ''
    do {
      const data = await this.youtubeGet(token, 'playlists', {
        part: 'snippet,contentDetails,status', mine: 'true', maxResults: '50',
        ...(pageToken ? { pageToken } : {}),
      })
      for (const item of data.items || []) {
        if (item.snippet?.channelId !== config.extra.expectedChannelId) throw new Error('播放列表与所选频道不一致')
        const t = item.snippet?.thumbnails || {}
        result.push({ id: item.id, title: item.snippet?.title || '未命名播放列表',
          description: item.snippet?.description || '',
          thumbnail: '', videoIds: [], coverUrl: t.medium?.url || t.high?.url || t.default?.url || '',
          itemCount: item.contentDetails?.itemCount || 0, privacyStatus: item.status?.privacyStatus || '',
          publishedAt: item.snippet?.publishedAt || '', url: `https://www.youtube.com/playlist?list=${encodeURIComponent(item.id)}` })
      }
      pageToken = data.nextPageToken || ''
    } while (pageToken)
    if (summaryOnly) return result.map(({ coverUrl, ...playlist }) => playlist)
    // Read membership IDs without downloading every video's details or thumbnail.
    // Bound concurrency so large channels do not create a burst of API requests.
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(4, result.length) }, async () => {
      while (cursor < result.length) {
        const playlist = result[cursor++]
        const ids = new Set<string>()
        let next = ''
        do {
          const page = await this.youtubeGet(token, 'playlistItems', {
            part: 'contentDetails', playlistId: playlist.id, maxResults: '50',
            ...(next ? { pageToken: next } : {}),
          })
          for (const item of page.items || []) if (item.contentDetails?.videoId) ids.add(item.contentDetails.videoId)
          next = page.nextPageToken || ''
        } while (next)
        playlist.videoIds = [...ids]
        playlist.thumbnail = await this.thumbnailToBase64(playlist.coverUrl)
      }
    }))
    return result.map(({ coverUrl, ...playlist }) => playlist)
  }

  async listPlaylistVideos(config: PlatformConfigLike, playlistId: string): Promise<YoutubeVideo[]> {
    if (typeof playlistId !== 'string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(playlistId)) throw new Error('无效的播放列表 ID')
    const token = await this.refreshAccessToken(config)
    await this.assertTarget(token, config)
    const data = await this.youtubeGet(token, 'playlists', { part: 'snippet', id: playlistId })
    if (data.items?.length !== 1 || data.items[0].snippet?.channelId !== config.extra.expectedChannelId) {
      throw new Error('播放列表不属于所选频道或已不可用，请刷新列表')
    }
    return this.readPlaylistVideos(token, playlistId)
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
    if (!config.extra?.expectedChannelId || chData.items?.length !== 1 || chData.items[0].id !== config.extra.expectedChannelId) {
      throw new Error('授权频道与所选频道不一致，请重新授权')
    }
    const uploadsPlaylist = chData?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
    if (!uploadsPlaylist) {
      throw new Error('未找到频道「上传」播放列表，请确认该账号已创建频道')
    }

    return this.readPlaylistVideos(accessToken, uploadsPlaylist)
  }

  private async readPlaylistVideos(accessToken: string, playlistId: string): Promise<YoutubeVideo[]> {
    // Preserve playlist order, including repeated videos and unavailable entries.

    const items: any[] = []
    let pageToken: string | undefined
    const MAX_PAGES = 100
    for (let i = 0; i < MAX_PAGES; i++) {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails',
        playlistId,
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
      if (i === MAX_PAGES - 1) throw new Error('播放列表超过 5000 条，暂无法完整读取')
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
      if (!vRes.ok) throw new Error(`获取视频详情失败：${vData?.error?.message || vRes.status}`)
      if (vData.items) {
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
        playlistItemId: it.id,
        unavailable: !statsMap[id],
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
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
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
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl',
      access_type: 'offline', // 必须，用于换取 refresh_token
      prompt: 'consent select_account',
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
