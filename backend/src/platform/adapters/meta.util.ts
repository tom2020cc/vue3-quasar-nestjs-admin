// Meta（Facebook / Instagram）通用工具：Graph API 请求 + OAuth 授权码换令牌链

// Graph API 根地址（版本号省略，默认使用 App 的默认版本）
export const META_GRAPH = 'https://graph.facebook.com'
// 视频上传专用 host（可恢复上传的 start/transfer/finish 阶段走这里）
export const META_GRAPH_VIDEO = 'https://graph-video.facebook.com'
// Meta 长期令牌有效期（秒）：约 60 天
export const META_TOKEN_EXPIRES = 5184000

// GET 请求 Graph API，自动解析 JSON，出错抛异常
export async function metaGet(path: string, params: Record<string, string>): Promise<any> {
  const url = `${META_GRAPH}${path}?${new URLSearchParams(params)}`
  const res = await fetch(url)
  const text = await res.text()
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  if (!res.ok || data?.error) {
    throw new Error(data?.error?.message || `HTTP ${res.status}: ${text}`)
  }
  return data
}

// 授权码 → 短期 token → 60 天长期 token → 取第一个 Page 的 pageId + pageAccessToken
export async function exchangeMetaCode(params: {
  code: string
  redirectUri: string
  appId: string
  appSecret: string
}): Promise<{ userToken: string; pageId: string; pageAccessToken: string }> {
  const { code, redirectUri, appId, appSecret } = params

  // 1. 授权码换短期用户 token
  const short = await metaGet('/oauth/access_token', {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  })
  if (!short.access_token) {
    throw new Error('换取短期 token 失败：' + JSON.stringify(short))
  }

  // 2. 短期 token 换 60 天长期 token
  const long = await metaGet('/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: short.access_token,
  })
  const userToken = long.access_token || short.access_token

  // 3. 取 Page 列表，拿第一个 Page 的 token + id
  const accounts = await metaGet('/me/accounts', { access_token: userToken })
  const page = accounts?.data?.[0]
  if (!page?.id || !page?.access_token) {
    throw new Error('未找到任何 Facebook Page，请先创建一个 Page 并确保账号是管理员')
  }

  return { userToken, pageId: page.id, pageAccessToken: page.access_token }
}
