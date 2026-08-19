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
import { readFileChunks, sleep } from './http.util'
import {
  META_GRAPH,
  META_GRAPH_VIDEO,
  META_TOKEN_EXPIRES,
  exchangeMetaCode,
} from './meta.util'

// Facebook 适配器（横屏、竖屏均支持）
// 官方接口：Facebook Graph API —— Page 视频可恢复上传
// 文档：https://developers.facebook.com/docs/video-api/guides/resumable-upload
@Injectable()
export class FacebookAdapter implements IPlatformAdapter {
  readonly code = PlatformCode.FACEBOOK
  readonly meta = PLATFORMS.find((p) => p.code === this.code)!
  readonly requiresPkce = false
  readonly requiresPublicUrl = false // 走二进制可恢复上传，不依赖对象存储

  // 发布必须用 Page Token + pageId，两者齐备才算配置完成
  isConfigured(config: PlatformConfigLike): boolean {
    const pageId = config.openId || config.extra?.pageId
    const pageToken = config.extra?.pageAccessToken || config.accessToken
    return !!pageId && !!pageToken
  }

  async publish(input: PublishVideoInput, config: PlatformConfigLike): Promise<PublishResult> {
    if (!this.isConfigured(config)) {
      await sleep(1500)
      return makeMockResult(this.code, input.title)
    }
    const pageId = config.openId || config.extra?.pageId
    const pageToken = config.extra?.pageAccessToken || config.accessToken
    try {
      return await this.realPublish(input, String(pageId), String(pageToken))
    } catch (e: any) {
      return { success: false, message: `Facebook 发布失败：${e.message}` }
    }
  }

  private async realPublish(
    input: PublishVideoInput,
    pageId: string,
    pageToken: string,
  ): Promise<PublishResult> {
    const chunkSize = 32 * 1024 * 1024 // 官方建议单分片不超过 64MB

    // 1. 开始可恢复上传，拿到 upload_session_id + video_id
    const startRes = await fetch(
      `${META_GRAPH_VIDEO}/${pageId}/videos?${new URLSearchParams({
        upload_phase: 'start',
        file_size: String(input.size),
        access_token: pageToken,
      })}`,
      { method: 'POST' },
    )
    const start: any = await startRes.json()
    const uploadSessionId = start?.upload_session_id
    const videoId = start?.video_id
    if (!uploadSessionId) {
      throw new Error('上传初始化失败：' + JSON.stringify(start))
    }

    // 2. 逐片传输（流式读取，start_offset 从 0 开始）
    let offset = 0
    for await (const chunk of readFileChunks(input.filePath, chunkSize)) {
      const res = await fetch(
        `${META_GRAPH_VIDEO}/${uploadSessionId}?${new URLSearchParams({
          upload_phase: 'transfer',
          start_offset: String(offset),
          access_token: pageToken,
        })}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: chunk,
        },
      )
      const data: any = await res.json()
      if (!res.ok || data?.error) {
        throw new Error(`分片传输失败：${JSON.stringify(data)}`)
      }
      offset = Number(data?.end_offset ?? offset + chunk.length)
    }

    // 3. 完成上传（附标题/描述）
    const finishRes = await fetch(
      `${META_GRAPH_VIDEO}/${uploadSessionId}?${new URLSearchParams({
        upload_phase: 'finish',
        upload_session_id: uploadSessionId,
        access_token: pageToken,
      })}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ title: input.title, description: input.description || '' }),
      },
    )
    const finish: any = await finishRes.json()
    if (!finishRes.ok || finish?.error) {
      throw new Error('上传完成失败：' + JSON.stringify(finish))
    }

    return {
      success: true,
      pending: true, // 已上传，仍需等待平台转码
      externalId: videoId,
      externalUrl: videoId ? `https://www.facebook.com/${videoId}` : '',
      message: 'Facebook 已上传，等待处理',
    }
  }

  // ---- 发布状态查询 ----
  async queryStatus({ externalId, config }: {
    externalId: string
    config: PlatformConfigLike
    pollCount: number
  }) {
    const pageToken = config.extra?.pageAccessToken || config.accessToken
    const res = await fetch(
      `${META_GRAPH}/${externalId}?fields=status&access_token=${pageToken}`,
    )
    const data: any = await res.json()
    const status = data?.status?.video_status
    if (status === 'ready') {
      return {
        status: 'success' as const,
        externalUrl: `https://www.facebook.com/${externalId}`,
        message: 'Facebook 发布完成',
      }
    }
    if (status === 'error') {
      return { status: 'failed' as const, message: `Facebook 处理失败：${JSON.stringify(data?.status)}` }
    }
    return { status: 'processing' as const, message: `Facebook 处理中（${status || 'unknown'}）` }
  }

  // ---- OAuth2 授权码流程（Meta Facebook Login） ----

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
      scope: 'pages_show_list,pages_read_engagement,pages_manage_posts',
      state,
    })
    return `https://www.facebook.com/dialog/oauth?${params.toString()}`
  }

  async exchangeCode({ code, redirectUri, config }: {
    code: string
    redirectUri: string
    codeVerifier?: string
    config: PlatformConfigLike
  }) {
    const { userToken, pageId, pageAccessToken } = await exchangeMetaCode({
      code,
      redirectUri,
      appId: config.appId!,
      appSecret: config.appSecret!,
    })
    return {
      accessToken: userToken,
      openId: pageId,
      expiresIn: META_TOKEN_EXPIRES,
      extra: { pageId, pageAccessToken },
    }
  }
}
