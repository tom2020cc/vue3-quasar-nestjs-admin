import request from '@/utils/request'

// 平台元信息（来自后端 PLATFORMS 定义）
export interface PlatformMeta {
  code: string
  name: string
  orientations: string[] // landscape 宽屏 / portrait 窄屏
  description: string
  apiBase: string
  requiredFields: string[]
  available: boolean // 是否可接入（false：需企业认证/付费等前置条件，暂关闭）
  unavailableReason?: string // 不可接入原因
}

// 平台配置（凭证）
export interface PlatformConfig {
  id: number
  code: string
  name: string
  enabled: boolean
  appId?: string | null
  appSecret?: string | null
  accessToken?: string | null
  refreshToken?: string | null
  openId?: string | null
  tokenExpiresAt?: string | null
  extra?: Record<string, any> | null
  remark?: string | null
}

// 平台定义 + 已保存配置的合并结果
export interface PlatformWithConfig extends PlatformMeta {
  config: PlatformConfig | null
}

// 获取平台定义列表
export const getPlatformList = () =>
  request<PlatformMeta[]>({ method: 'GET', url: '/platform/list' })

// 获取平台配置（含元信息）
export const getPlatformConfigs = () =>
  request<PlatformWithConfig[]>({ method: 'GET', url: '/platform' })

// 更新平台配置
export const updatePlatformConfig = (id: number, data: Partial<PlatformConfig>) =>
  request({ method: 'PATCH', url: `/platform/${id}`, data })

// 删除平台配置
export const removePlatformConfig = (id: number) =>
  request({ method: 'DELETE', url: `/platform/${id}` })

// 获取 OAuth 授权跳转地址
export const getOAuthUrl = (code: string) =>
  request<{ url: string }>({ method: 'GET', url: `/platform/${code}/oauth/url` })

// 刷新访问令牌
export const refreshOAuthToken = (code: string) =>
  request({ method: 'POST', url: `/platform/${code}/oauth/refresh` })
