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

// 快手适配器（窄屏）
// 官方接口：快手开放平台「发布视频」能力（scope: user_video_publish）
// 流程：发起上传 start_upload → 上传视频 → 发布视频（异步，约 1 分钟生效）
// 文档：https://open.kuaishou.com/platformDocs/openAbility/contentManagement/createAVideo.html
// 注意：发布接口的精确路径与入参随应用类型略有差异，对接时以官方文档为准。
@Injectable()
export class KuaishouAdapter implements IPlatformAdapter {
  readonly code = PlatformCode.KUAISHOU
  readonly meta = PLATFORMS.find((p) => p.code === this.code)!
  readonly requiresPkce = false

  async publish(input: PublishVideoInput, config: PlatformConfigLike): Promise<PublishResult> {
    if (!config.accessToken || !config.appId) {
      await sleep(1500)
      return makeMockResult(this.code, input.title)
    }
    try {
      return await this.realPublish(input, config)
    } catch (e: any) {
      return { success: false, message: `快手发布失败：${e.message}` }
    }
  }

  private async realPublish(input: PublishVideoInput, config: PlatformConfigLike): Promise<PublishResult> {
    const base = 'https://open.kuaishou.com'

    // 1. 发起上传，获取 upload_token 与上传网关 endpoint
    const startUrl = `${base}/openapi/photo/start_upload?access_token=${config.accessToken}&app_id=${config.appId}`
    const startRes = await fetch(startUrl, { method: 'POST' })
    const startData: any = await startRes.json()
    const uploadToken = startData?.upload_token
    const endpoint = startData?.endpoint
    if (!uploadToken || !endpoint) {
      throw new Error('发起上传失败：' + JSON.stringify(startData))
    }

    // 2. 上传视频（整体二进制，适合 <10MB；大文件走 /api/upload/fragment 分片）
    const buf = await readFileBuffer(input.filePath)
    const upRes = await fetch(`http://${endpoint}/api/upload?upload_token=${uploadToken}`, {
      method: 'POST',
      headers: { 'Content-Type': input.mime || 'video/mp4' },
      body: buf,
    })
    if (!upRes.ok) {
      throw new Error('上传失败：' + (await upRes.text()))
    }

    // 3. 发布视频（异步过程）
    const pubRes = await fetch(
      `${base}/openapi/photo/publish?access_token=${config.accessToken}&app_id=${config.appId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upload_token: uploadToken,
          caption: input.title,
          cover: input.coverUrl || '',
        }),
      },
    )
    const pubData: any = await pubRes.json()

    return {
      success: true,
      pending: true, // 快手发布为异步，作品转码中
      externalId: pubData?.photo_id || uploadToken,
      externalUrl: '',
      message: '快手已提交，作品转码中（约 1 分钟后生效）',
    }
  }

  // ---- 发布状态查询 ----
  // 快手发布为异步，最终状态通过「查询视频列表」确认。
  // 返回列表中的 video，若 photo_id 已存在且 pending 为 false 即视为完成。
  // 文档：https://open.kuaishou.com/platformDocs/openAbility/contentManagement/queryUserVideoList.html
  // 注：不同应用类型接口路径有差异，此处为尽力而为的查询，查询失败时保持 processing 由轮询兜底。
  async queryStatus({ externalId, config }: {
    externalId: string
    config: PlatformConfigLike
    pollCount: number
  }) {
    try {
      const res = await fetch(
        `https://open.kuaishou.com/openapi/photo/list?access_token=${config.accessToken}&app_id=${config.appId}`,
        { method: 'POST' },
      )
      const data: any = await res.json()
      const videos: any[] = data?.video_list || data?.data?.video_list || []
      const target = videos.find((v: any) => v.photo_id === externalId)
      if (target && target.pending === false) {
        return { status: 'success' as const, message: '快手发布完成' }
      }
      if (target && target.pending === true) {
        return { status: 'processing' as const, message: '快手作品转码处理中' }
      }
      // 未查询到目标视频，可能仍在排队或接口字段差异，保持 processing
      return { status: 'processing' as const, message: '快手作品排队处理中' }
    } catch (e: any) {
      return { status: 'processing' as const, message: `快手状态查询异常：${e.message}` }
    }
  }

  // ---- OAuth2 授权码流程（快手开放平台） ----

  buildAuthUrl({ state, redirectUri, config }: {
    state: string
    redirectUri: string
    codeVerifier?: string
    config: PlatformConfigLike
  }): string {
    const params = new URLSearchParams({
      app_id: config.appId!,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'user_video_publish',
      state,
    })
    return `https://open.kuaishou.com/oauth2/authorize?${params.toString()}`
  }

  async exchangeCode({ code, config }: {
    code: string
    redirectUri: string
    codeVerifier?: string
    config: PlatformConfigLike
  }) {
    const data = await postForm('https://open.kuaishou.com/oauth2/access_token', {
      app_id: config.appId!,
      app_secret: config.appSecret!,
      code,
      grant_type: 'authorization_code',
    })
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      openId: data.open_id,
      expiresIn: data.expires_in,
    }
  }

  async refresh(config: PlatformConfigLike) {
    const data = await postForm('https://open.kuaishou.com/oauth2/refresh_token', {
      app_id: config.appId!,
      app_secret: config.appSecret!,
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
