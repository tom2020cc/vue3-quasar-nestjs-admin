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
import { META_GRAPH, META_TOKEN_EXPIRES, exchangeMetaCode, metaGet } from './meta.util'

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
      return await this.realPublish(input, String(igUserId), String(token))
    } catch (e: any) {
      return { success: false, message: `Instagram 发布失败：${e.message}` }
    }
  }

  private async realPublish(
    input: PublishVideoInput,
    igUserId: string,
    token: string,
  ): Promise<PublishResult> {
    // 1. 创建媒体容器（Reels，用对象存储公网 URL）
    const data = await postForm(`${META_GRAPH}/${igUserId}/media`, {
      media_type: 'REELS',
      video_url: input.publicUrl!,
      caption: input.title,
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

    const res = await fetch(`${META_GRAPH}/${externalId}?fields=status_code&access_token=${token}`)
    const data: any = await res.json()
    const status = data?.status_code

    if (status === 'FINISHED') {
      // 容器就绪 → 正式发布
      try {
        const pubData = await postForm(`${META_GRAPH}/${igUserId}/media_publish`, {
          creation_id: externalId,
          access_token: token,
        })
        const mediaId = pubData?.id
        return {
          status: 'success' as const,
          externalUrl: mediaId ? `https://www.instagram.com/p/${mediaId}/` : '',
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
      scope: 'instagram_business_basic,instagram_business_content_publish,pages_show_list,pages_read_engagement',
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

    // 由 Page 解析出绑定的 Instagram 专业账号
    const ig = await metaGet(`/${pageId}`, {
      fields: 'instagram_business_account',
      access_token: pageAccessToken,
    })
    const igUserId = ig?.instagram_business_account?.id
    if (!igUserId) {
      throw new Error('未找到绑定的 Instagram 专业账号，请先把 IG 切换为 Business 并绑定该 Page')
    }

    return {
      accessToken: userToken,
      openId: igUserId,
      expiresIn: META_TOKEN_EXPIRES,
      extra: { pageId, pageAccessToken, igUserId },
    }
  }
}
