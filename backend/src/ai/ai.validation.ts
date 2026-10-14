import { BadRequestException } from '@nestjs/common'

export const AI_KEYS = ['id', 'ownerId', 'name', 'provider', 'baseUrl', 'model', 'apiKey', 'enabled']
export const PROVIDERS = ['deepseek', 'qwen', 'glm', 'openai', 'custom']
export function validateModel(value: Record<string, any>) {
  const bad = () => { throw new BadRequestException('模型配置无效，请检查名称、模型 ID、接口地址和 API Key') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad()
  if (Object.keys(value).some(k => !AI_KEYS.includes(k))) bad()
  for (const [key, max] of [['name', 100], ['model', 200], ['baseUrl', 1000], ['apiKey', 4096]] as const) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > max || /[\r\n\0]/.test(value[key])) bad()
  }
  if (!PROVIDERS.includes(value.provider) || typeof value.enabled !== 'boolean') bad()
  try {
    const url = new URL(value.baseUrl)
    if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) bad()
  } catch { bad() }
}
