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
import { postForm, readFileChunks, sleep } from './http.util'

// 国产抖音适配器（宽屏、窄屏均支持）
// 官方接口：抖音开放平台「代替用户发布内容到抖音」
// 流程：分片初始化 video/part/init → 逐片上传 video/part/upload → 完成 video/part/complete → 创建视频 video/create
// 文档：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/video-management/douyin/create-video/video-part-upload-init
@Injectable()
export class DouyinAdapter implements IPlatformAdapter {
  readonly code = PlatformCode.DOUYIN_CN
  readonly meta = PLATFORMS.find((p) => p.code === this.code)!
  readonly requiresPkce = false

  // 抖音必须同时具备 access_token 与 open_id 才算配置完成
  isConfigured(config: PlatformConfigLike): boolean {
    return !!config.accessToken && !!config.openId
  }

  async publish(input: PublishVideoInput, config: PlatformConfigLike): Promise<PublishResult> {
    if (!this.isConfigured(config)) {
      await sleep(1500)
      return makeMockResult(this.code, input.title)
    }
    try {
      return await this.realPublish(input, config)
    } catch (e: any) {
      return { success: false, message: `抖音发布失败：${e.message}` }
    }
  }

  private async realPublish(input: PublishVideoInput, config: PlatformConfigLike): Promise<PublishResult> {
    const token = config.accessToken!
    const openId = config.openId!
    const base = 'https://open.douyin.com'
    // 抖音建议单个分片 20MB，最小 5MB
    const chunkSize = 20 * 1024 * 1024

    // 1. 分片上传初始化，获取 upload_id
    const initRes = await fetch(`${base}/video/part/init/?open_id=${openId}`, {
      method: 'POST',
      headers: { 'access-token': token },
    })
    const initData: any = await initRes.json()
    const uploadId = initData?.data?.upload_id
    if (!uploadId) {
      throw new Error('分片初始化失败：' + JSON.stringify(initData))
    }

    // 2. 逐片上传（part_number 从 1 开始，流式读取避免整文件进内存）
    let partNumber = 1
    for await (const chunk of readFileChunks(input.filePath, chunkSize)) {
      const form = new FormData()
      form.append('video', new Blob([chunk]), input.fileName)
      const upRes = await fetch(
        `${base}/video/part/upload/?open_id=${openId}&upload_id=${uploadId}&part_number=${partNumber}`,
        { method: 'POST', headers: { 'access-token': token }, body: form },
      )
      if (!upRes.ok) {
        throw new Error(`分片 ${partNumber} 上传失败：${await upRes.text()}`)
      }
      partNumber++
    }

    // 3. 完成分片上传，获取 video_id
    const doneRes = await fetch(
      `${base}/video/part/complete/?open_id=${openId}&upload_id=${uploadId}`,
      { method: 'POST', headers: { 'access-token': token } },
    )
    const doneData: any = await doneRes.json()
    const videoId = doneData?.data?.video?.video_id
    if (!videoId) {
      throw new Error('分片完成失败：' + JSON.stringify(doneData))
    }

    // 4. 创建视频（发布）
    const pubRes = await fetch(`${base}/video/create/?open_id=${openId}`, {
      method: 'POST',
      headers: { 'access-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_id: videoId, text: input.title }),
    })
    const pubData: any = await pubRes.json()

    return {
      success: true,
      pending: true, // 已创建视频，进入平台审核/转码
      externalId: videoId,
      externalUrl: `https://www.douyin.com/video/${videoId}`,
      message: '抖音已提交，审核处理中',
    }
  }

  // ---- 发布状态查询 ----
  // 抖音「代替用户发布内容」的最终状态可通过「查询视频数据」接口确认
  // 文档：https://open.douyin.com/platform/resource/docs/openapi/video-management/douyin/search-video/video-data/
  // 注：审核中/违规的视频可能查询不到 item，此时保持 processing，由轮询超时兜底
  async queryStatus({ externalId, config }: {
    externalId: string
    config: PlatformConfigLike
    pollCount: number
  }) {
    const res = await fetch(
      `https://open.douyin.com/video/data/?open_id=${config.openId}`,
      {
        method: 'POST',
        headers: { 'access-token': config.accessToken!, 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_ids: [externalId] }),
      },
    )
    const data: any = await res.json()
    const item = data?.data?.list?.[0]
    if (item && item.item_id) {
      return {
        status: 'success' as const,
        externalUrl: `https://www.douyin.com/video/${externalId}`,
        message: '抖音发布完成',
      }
    }
    return { status: 'processing' as const, message: '抖音审核/转码处理中' }
  }

  // ---- OAuth2 授权码流程（抖音开放平台） ----

  buildAuthUrl({ state, redirectUri, config }: {
    state: string
    redirectUri: string
    codeVerifier?: string
    config: PlatformConfigLike
  }): string {
    const params = new URLSearchParams({
      client_key: config.appId!,
      response_type: 'code',
      scope: 'video.create',
      redirect_uri: redirectUri,
      state,
    })
    return `https://open.douyin.com/platform/oauth/connect/?${params.toString()}`
  }

  async exchangeCode({ code, config }: {
    code: string
    redirectUri: string
    codeVerifier?: string
    config: PlatformConfigLike
  }) {
    const data = await postForm('https://open.douyin.com/oauth/access_token/', {
      client_key: config.appId!,
      client_secret: config.appSecret!,
      code,
      grant_type: 'authorization_code',
    })
    const d = data?.data || data
    return {
      accessToken: d.access_token,
      openId: d.open_id,
      refreshToken: d.refresh_token,
      expiresIn: d.expires_in,
    }
  }

  async refresh(config: PlatformConfigLike) {
    const data = await postForm('https://open.douyin.com/oauth/refresh_token/', {
      client_key: config.appId!,
      refresh_token: config.refreshToken!,
      grant_type: 'refresh_token',
    })
    const d = data?.data || data
    return {
      accessToken: d.access_token,
      refreshToken: d.refresh_token,
      expiresIn: d.expires_in,
    }
  }
}
