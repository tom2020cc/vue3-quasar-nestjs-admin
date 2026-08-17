// ============================================================
// 平台适配器统一接口定义
// 所有视频平台的「发布」能力都通过该接口抽象。
// 新增平台只需三步：
//   1) 在 PlatformCode / PLATFORMS 中登记元信息；
//   2) 新建一个实现 IPlatformAdapter 的类；
//   3) 在 platform-adapter.factory.ts 中注册。
// ============================================================

// 视频尺寸方向：宽屏（横屏）与窄屏（竖屏）
export enum Orientation {
  LANDSCAPE = 'landscape', // 宽屏（横屏）：宽 > 高
  PORTRAIT = 'portrait', // 窄屏（竖屏）：高 > 宽
}

// 平台编码（唯一标识，对应 platform_config 表中的 code 字段）
export enum PlatformCode {
  DOUYIN_CN = 'douyin_cn', // 国产抖音（宽屏、窄屏均支持）
  YOUTUBE = 'youtube', // 油管 YouTube（宽屏）
  TIKTOK = 'tiktok', // 抖音海外版 TikTok（窄屏）
  KUAISHOU = 'kuaishou', // 快手（窄屏）
}

// 平台元信息：前端「平台配置页 / 发布页」依据它展示，避免前后端各写一套
export interface PlatformMeta {
  code: PlatformCode
  name: string
  orientations: Orientation[] // 该平台支持的视频尺寸方向
  description: string
  apiBase: string // 官方接口根地址
  requiredFields: string[] // 发布所需的配置字段（用于「配置说明」）
  available: boolean // 是否可接入（false：需企业认证/付费等前置条件，暂关闭）
  unavailableReason?: string // 不可接入原因（展示给用户）
}

export const PLATFORMS: PlatformMeta[] = [
  {
    code: PlatformCode.DOUYIN_CN,
    name: '国产抖音',
    orientations: [Orientation.LANDSCAPE, Orientation.PORTRAIT],
    description: '抖音开放平台「代替用户发布内容到抖音」能力',
    apiBase: 'https://open.douyin.com',
    requiredFields: ['appId(client_key)', 'appSecret(client_secret)', 'accessToken', 'openId'],
    available: false,
    unavailableReason: '需企业认证（约 600 元/年），个人开发者暂不可接入',
  },
  {
    code: PlatformCode.YOUTUBE,
    name: '油管 YouTube',
    orientations: [Orientation.LANDSCAPE],
    description: 'YouTube Data API v3（OAuth2 授权、可恢复上传）',
    apiBase: 'https://www.googleapis.com',
    requiredFields: ['appId(client_id)', 'appSecret(client_secret)', 'refreshToken'],
    available: true,
  },
  {
    code: PlatformCode.TIKTOK,
    name: 'TikTok 海外版',
    orientations: [Orientation.PORTRAIT],
    description: 'TikTok Content Posting API',
    apiBase: 'https://open.tiktokapis.com',
    requiredFields: ['appId(client_key)', 'appSecret(client_secret)', 'accessToken'],
    available: true,
  },
  {
    code: PlatformCode.KUAISHOU,
    name: '快手',
    orientations: [Orientation.PORTRAIT],
    description: '快手开放平台「发布视频」能力（scope: user_video_publish）',
    apiBase: 'https://open.kuaishou.com',
    requiredFields: ['appId', 'appSecret', 'accessToken'],
    available: false,
    unavailableReason: '需企业资质认证，个人开发者暂不可接入',
  },
]

// 需要发布到平台的视频信息（后端已把视频文件落到本地磁盘）
export interface PublishVideoInput {
  filePath: string // 本地文件绝对路径
  fileName: string
  size: number // 字节
  mime: string // 如 video/mp4
  orientation: Orientation
  title: string
  description?: string
  coverUrl?: string
}

export interface PublishResult {
  success: boolean
  pending?: boolean // 是否已提交但仍在平台处理中（转码/审核），需要后续轮询最终状态
  externalId?: string // 平台返回的视频 ID
  externalUrl?: string // 平台视频可访问链接
  message?: string // 结果 / 错误说明
  mock?: boolean // 是否为模拟发布（未配置真实凭证时）
}

// 轮询平台发布状态返回的结果
export interface IPublishStatusResult {
  status: 'processing' | 'success' | 'failed'
  externalUrl?: string
  message?: string
}

// 平台配置结构（用结构化类型，避免适配器反向依赖 TypeORM 实体）
export interface PlatformConfigLike {
  code: string
  name?: string
  enabled: boolean
  appId?: string | null
  appSecret?: string | null
  accessToken?: string | null
  refreshToken?: string | null
  tokenExpiresAt?: Date | null
  openId?: string | null
  extra?: Record<string, any> | null
}

// OAuth 换取令牌后，需要回写到平台配置的字段
export interface OAuthTokenResult {
  accessToken?: string
  refreshToken?: string
  openId?: string
  expiresIn?: number // 秒
}

// OAuth2 授权码流程：每个平台实现「构建授权地址 → 授权码换令牌 → 刷新令牌」
export interface IOAuthProvider {
  // 是否需要 PKCE（TikTok 强制，其它平台使用 client_secret 即可）
  requiresPkce: boolean
  // 构建授权跳转地址（用户浏览器跳转到平台授权页）
  buildAuthUrl(params: {
    state: string
    redirectUri: string
    codeVerifier?: string
    config: PlatformConfigLike
  }): string
  // 用授权码换取访问令牌
  exchangeCode(params: {
    code: string
    redirectUri: string
    codeVerifier?: string
    config: PlatformConfigLike
  }): Promise<OAuthTokenResult>
  // 用 refresh_token 刷新访问令牌（可选）
  refresh?(config: PlatformConfigLike): Promise<OAuthTokenResult>
}

export interface IPlatformAdapter extends IOAuthProvider {
  readonly code: PlatformCode
  readonly meta: PlatformMeta
  publish(input: PublishVideoInput, config: PlatformConfigLike): Promise<PublishResult>
  // 查询发布最终状态（部分平台发布为异步，需轮询落库）
  queryStatus?(params: {
    externalId: string
    config: PlatformConfigLike
    pollCount: number
  }): Promise<IPublishStatusResult>
}

// 生成模拟发布结果（未配置真实凭证时使用，便于本地联调）
// 返回 pending: true，由轮询服务模拟「平台处理中 → 完成」的过程
export function makeMockResult(code: string, title: string): PublishResult {
  return {
    success: true,
    pending: true,
    mock: true,
    externalId: `mock_${code}_${Date.now()}`,
    externalUrl: '',
    message: `【模拟发布】${title} 已提交，平台处理中…`,
  }
}
