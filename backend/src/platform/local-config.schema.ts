import { AI_KEYS, validateModel } from '../ai/ai.validation'
import { BadRequestException } from '@nestjs/common'
import { PLATFORMS } from './adapters/platform.interface'

export const BACKEND_KEYS = [
  'DB_DATABASE', 'DB_SYNCHRONIZE', 'BACKEND_PORT', 'BACKEND_BASE_URL', 'FRONTEND_URL',
  'POLL_INTERVAL_MS', 'POLL_MAX_ATTEMPTS', 'JWT_SECRET', 'JWT_EXPIRES_IN',
  'STORAGE_ENDPOINT', 'STORAGE_REGION', 'STORAGE_BUCKET', 'STORAGE_ACCESS_KEY',
  'STORAGE_SECRET_KEY', 'STORAGE_URL_EXPIRES', 'HTTP_PROXY', 'HTTPS_PROXY',
  'NO_PROXY', 'NODE_USE_ENV_PROXY',
]
export const FRONTEND_KEYS = ['VITE_API_BASE_URL']
export const PLATFORM_KEYS = [
  'code', 'name', 'enabled', 'appId', 'appSecret', 'accessToken', 'refreshToken',
  'tokenExpiresAt', 'openId', 'extra', 'remark',
]
export const MAX_CONFIG_BYTES = 1024 * 1024
export const YOUTUBE_ACCOUNT_KEYS = ['id', 'channelId', 'channelTitle', 'label', 'enabled', 'appId', 'appSecret', 'accessToken', 'refreshToken', 'tokenExpiresAt']
export const TIKTOK_ACCOUNT_KEYS = ['id', 'openId', 'displayName', 'label', 'enabled', 'appId', 'appSecret', 'accessToken', 'refreshToken', 'tokenExpiresAt']
export interface LocalConfigDocument {
  format: 'video-platform-local-config'
  version: 1 | 2 | 3 | 4 | 5
  aiModels?: Record<string, any>[]
  googleQuotaCredentials?: Record<string, any>[]
  exportedAt?: string
  instructions?: string[]
  backendEnv?: Record<string, string>
  frontendEnv?: Record<string, string>
  platforms?: Record<string, any>[]
  tiktokAccounts?: Record<string, any>[]
  youtubeAccounts?: Record<string, any>[]
}

function invalid(message: string): never {
  throw new BadRequestException(message)
}
function object(value: any): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function safeTree(value: any, depth = 0) {
  if (depth > 12) invalid('配置嵌套层级过深')
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) invalid('配置包含不允许的属性')
      safeTree(value[key], depth + 1)
    }
  }
}
export function envValue(value: string): string {
  // dotenv supports these three delimiters; never allow newline injection.
  if (/[\r\n\0]/.test(value)) invalid('环境变量不能包含换行或空字符')
  const quote = ["'", '"', '`'].find((q) => !value.includes(q))
  if (!quote) invalid('环境变量包含无法保存的引号组合')
  return quote + value + quote
}
function validateEnv(env: any, allowed: string[]) {
  if (!object(env)) invalid('环境配置必须是对象')
  for (const [key, value] of Object.entries(env)) {
    if (!allowed.includes(key) || typeof value !== 'string' || value.length > 8192) invalid('环境配置包含未知字段或无效值')
    envValue(value as string)
    if (['BACKEND_PORT', 'POLL_INTERVAL_MS', 'POLL_MAX_ATTEMPTS', 'STORAGE_URL_EXPIRES'].includes(key)) {
      if (!/^\d+$/.test(value as string) || Number(value) < 1 || Number(value) > (key === 'BACKEND_PORT' ? 65535 : 2147483647)) invalid('端口或时间配置无效')
    }
    if (key === 'DB_SYNCHRONIZE' && !['true', 'false'].includes(value as string)) invalid('DB_SYNCHRONIZE 必须为 true 或 false')
    if (key === 'NODE_USE_ENV_PROXY' && !['0', '1'].includes(value as string)) invalid('NODE_USE_ENV_PROXY 必须为 0 或 1')
    if (key === 'JWT_SECRET' && (value as string).length < 16) invalid('JWT_SECRET 至少需要 16 个字符')
    if (key === 'JWT_EXPIRES_IN' && !/^\d+(ms|s|m|h|d|w|y)$/.test(value as string)) invalid('JWT_EXPIRES_IN 应包含时间单位，例如 6000s')
    if (['BACKEND_BASE_URL', 'FRONTEND_URL', 'STORAGE_ENDPOINT', 'HTTP_PROXY', 'HTTPS_PROXY', 'VITE_API_BASE_URL'].includes(key)) {
      if (value === '' && ['STORAGE_ENDPOINT', 'HTTP_PROXY', 'HTTPS_PROXY'].includes(key)) continue
      try {
        const url = new URL(value as string)
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error()
      } catch { invalid('服务地址或代理地址必须是有效的 HTTP/HTTPS 地址') }
    }
  }
}
export function validateDocument(input: unknown): LocalConfigDocument {
  if (!object(input)) invalid('请选择 JSON 配置文件')
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > MAX_CONFIG_BYTES) invalid('配置文件不能超过 1 MB')
  safeTree(input)
  if (input.format !== 'video-platform-local-config' || ![1, 2, 3, 4, 5].includes(input.version)) invalid('不支持的配置格式或版本')
  const topKeys = ['format', 'version', 'exportedAt', 'instructions', 'backendEnv', 'frontendEnv', 'platforms', 'youtubeAccounts', 'tiktokAccounts', 'aiModels', 'googleQuotaCredentials']
  if (Object.keys(input).some((k) => !topKeys.includes(k))) invalid('配置包含未知字段')
  if (input.exportedAt !== undefined && (typeof input.exportedAt !== 'string' || !Number.isFinite(Date.parse(input.exportedAt)))) invalid('导出时间无效')
  if (input.instructions !== undefined && (!Array.isArray(input.instructions) || input.instructions.some((v: any) => typeof v !== 'string'))) invalid('配置说明格式无效')
  if (input.backendEnv !== undefined) validateEnv(input.backendEnv, BACKEND_KEYS)
  if (input.frontendEnv !== undefined) validateEnv(input.frontendEnv, FRONTEND_KEYS)
  if (input.platforms !== undefined) {
    if (!Array.isArray(input.platforms)) invalid('平台配置必须是数组')
    const seen = new Set<string>()
    for (const p of input.platforms) {
      if (!object(p) || !PLATFORMS.some((meta) => meta.code === p.code) || seen.has(p.code)) invalid('平台编码无效或重复')
      seen.add(p.code)
      for (const [key, value] of Object.entries(p)) {
        if (!PLATFORM_KEYS.includes(key)) invalid('平台配置包含未知字段')
        if (key === 'enabled') {
          if (typeof value !== 'boolean') invalid('平台启用状态必须为布尔值')
        } else if (key === 'extra') {
          if (value !== null && !object(value)) invalid('平台 extra 配置必须为对象或 null')
        } else if (value !== null && (typeof value !== 'string' || value.length > 65536)) invalid('平台配置字段类型或长度无效')
        if (key === 'name' && (typeof value !== 'string' || !value.trim())) invalid('平台名称不能为空')
        if (key === 'tokenExpiresAt' && value !== null && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value)))) invalid('令牌过期时间必须为 ISO 日期或 null')
      }
    }
  }
  if (input.youtubeAccounts !== undefined) {
    if (input.version < 2 || !Array.isArray(input.youtubeAccounts)) invalid('多账号配置需要使用版本 2')
    const ids = new Set<string>(), channels = new Set<string>()
    for (const a of input.youtubeAccounts) {
      if (!object(a) || Object.keys(a).some((k) => !YOUTUBE_ACCOUNT_KEYS.includes(k)) || YOUTUBE_ACCOUNT_KEYS.some((k) => !(k in a))) invalid('YouTube 账号字段缺失或未知')
      if (typeof a.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(a.id) || ids.has(a.id)) invalid('YouTube 账号 ID 无效或重复')
      ids.add(a.id)
      if (a.channelId !== null && (typeof a.channelId !== 'string' || !/^UC[\w-]{22}$/.test(a.channelId) || channels.has(a.channelId))) invalid('YouTube 频道 ID 无效或重复')
      if (a.channelId) channels.add(a.channelId)
      if (typeof a.enabled !== 'boolean') invalid('YouTube 启用状态无效')
      for (const k of ['channelTitle', 'label', 'appId', 'appSecret', 'refreshToken']) {
        if (typeof a[k] !== 'string' || a[k].length > 65536) invalid('YouTube 账号字段格式无效')
      }
      if (!a.appId || !a.appSecret || !a.refreshToken) invalid('YouTube 账号凭证不完整')
      if (a.accessToken !== null && (typeof a.accessToken !== 'string' || a.accessToken.length > 65536)) invalid('YouTube 访问令牌格式无效')
      if (a.tokenExpiresAt !== null && (typeof a.tokenExpiresAt !== 'string' || !Number.isFinite(Date.parse(a.tokenExpiresAt)))) invalid('YouTube 令牌到期时间无效')
    }
  }
  if (input.tiktokAccounts !== undefined) {
    if (input.version < 3 || !Array.isArray(input.tiktokAccounts)) invalid('多账号配置需要使用版本 3')
    const ids = new Set<string>(), channels = new Set<string>()
    for (const a of input.tiktokAccounts) {
      if (!object(a) || Object.keys(a).some((k) => !TIKTOK_ACCOUNT_KEYS.includes(k)) || TIKTOK_ACCOUNT_KEYS.some((k) => !(k in a))) invalid('TikTok 账号字段缺失或未知')
      if (typeof a.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(a.id) || ids.has(a.id)) invalid('TikTok 账号 ID 无效或重复')
      ids.add(a.id)
      if (a.openId !== null && (typeof a.openId !== 'string' || !a.openId.trim() || a.openId.length > 512 || channels.has(a.appId + ':' + a.openId))) invalid('TikTok 频道 ID 无效或重复')
      if (a.openId) channels.add(a.appId + ':' + a.openId)
      if (typeof a.enabled !== 'boolean') invalid('TikTok 启用状态无效')
      for (const k of ['displayName', 'label', 'appId', 'appSecret', 'refreshToken']) {
        if (typeof a[k] !== 'string' || a[k].length > 65536) invalid('TikTok 账号字段格式无效')
      }
      if (!a.appId || !a.appSecret || !a.refreshToken) invalid('TikTok 账号凭证不完整')
      if (a.accessToken !== null && (typeof a.accessToken !== 'string' || a.accessToken.length > 65536)) invalid('TikTok 访问令牌格式无效')
      if (a.tokenExpiresAt !== null && (typeof a.tokenExpiresAt !== 'string' || !Number.isFinite(Date.parse(a.tokenExpiresAt)))) invalid('TikTok 令牌到期时间无效')
    }
  }
  if (input.googleQuotaCredentials !== undefined) {
    if (input.version < 5 || !Array.isArray(input.googleQuotaCredentials)) invalid('Cloud 配额授权需要版本 5')
    const seen = new Set<string>()
    for (const a of input.googleQuotaCredentials) {
      if (!object(a) || Object.keys(a).some(k => !['projectNumber', 'appId', 'appSecret', 'refreshToken'].includes(k))) invalid('Cloud 配额配置格式无效')
      if (typeof a.projectNumber !== 'string' || !/^\d+$/.test(a.projectNumber) || seen.has(a.projectNumber)) invalid('Cloud 项目编号无效或重复')
      for (const k of ['appId', 'appSecret', 'refreshToken']) if (typeof a[k] !== 'string' || !a[k] || a[k].length > 65536) invalid('Cloud 配额凭证不完整')
      if (!a.appId.startsWith(a.projectNumber + '-') || !a.appId.endsWith('.apps.googleusercontent.com')) invalid('Cloud 配额应用与项目不匹配')
      seen.add(a.projectNumber)
    }
  }
  if (input.aiModels !== undefined) {
    if (input.version < 4 || !Array.isArray(input.aiModels)) invalid('AI 模型配置需要版本 4')
    const ids = new Set<string>()
    for (const model of input.aiModels) {
      validateModel(model)
      if (AI_KEYS.some(k => !(k in model)) || typeof model.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(model.id) || ids.has(model.id) || !Number.isSafeInteger(model.ownerId) || model.ownerId < 1) invalid('AI 模型 ID 或所属用户无效')
      ids.add(model.id)
    }
  }
  if (!input.googleQuotaCredentials?.length && !input.aiModels?.length && !input.platforms?.length && !input.youtubeAccounts?.length && !input.tiktokAccounts?.length && !Object.keys(input.backendEnv || {}).length && !Object.keys(input.frontendEnv || {}).length) invalid('配置文件没有可导入的配置')
  return input as LocalConfigDocument
}
