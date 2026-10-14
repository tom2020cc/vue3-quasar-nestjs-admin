import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { GoogleQuotaCredential } from './entities/google-quota-credential.entity'
import { quotaDay, quotaStart, youtubeProjectNumber } from './quota-time'

export const CLOUD_READ_SCOPES = ['https://www.googleapis.com/auth/cloud-platform.read-only', 'https://www.googleapis.com/auth/monitoring.read']
const PREFIX = 'serviceruntime.googleapis.com/quota/'
class QuotaQueryError extends BadRequestException {
  constructor(message: string, readonly quotaStatus = 'error') { super(message) }
}

// No API response bodies are returned in errors: Google may include credential details.
function apiError(status: number, body: any) {
  const reason = body?.error?.details?.find((d: any) => d.reason)?.reason
  if (reason === 'BILLING_DISABLED' || /requires billing to be enabled|billing.*(?:disabled|not enabled)/i.test(body?.error?.message || '')) return new QuotaQueryError('Google Cloud 要求该项目启用结算后才能通过 Monitoring API 读取已用量。只读授权已保存，无需重复授权；每日上限可正常读取，已用和剩余暂时未知。', 'billing_required')
  if (reason === 'SERVICE_DISABLED') return new QuotaQueryError('Google Cloud 查询 API 尚未启用，请通过下方入口启用 Service Usage API 和 Cloud Monitoring API。')
  if (status === 403) return new QuotaQueryError('当前 Google 账号无权读取该项目配额，请使用项目管理员账号授权，或授予 Monitoring Viewer 和 Service Usage Viewer 只读角色。')
  if (status === 401 || body?.error === 'invalid_grant') return new QuotaQueryError('Google Cloud 只读授权已失效，请重新连接。')
  return new QuotaQueryError(`Google Cloud 查询失败（HTTP ${status}），稍后自动重试。`)
}

export function dailyLimits(metrics: any[]) {
  return metrics.flatMap(m => (m.consumerQuotaLimits || []).filter((l: any) => /^1\/d\/\{project\}$/.test(l.unit)).map((l: any) => {
    const buckets = (l.quotaBuckets || []).filter((b: any) => !Object.keys(b.dimensions || {}).length)
    const limit = buckets.length === 1 ? Number(buckets[0].effectiveLimit) : NaN
    return { metric: m.metric, limitName: l.name?.split('/').pop(), name: l.displayName || m.displayName || m.metric, dailyLimit: Number.isSafeInteger(limit) && limit >= 0 ? limit : null }
  }))
}

export function rateUsage(series: any[], start: Date, now: Date, gauge: boolean) {
  let total = 0, count = 0, latest = 0
  // A time series may span response pages. Merge before picking its latest gauge.
  const merged = new Map<string, any>()
  for (const s of series) {
    const labels = (v: any) => Object.entries(v || {}).sort(([a], [b]) => a.localeCompare(b))
    const key = JSON.stringify([s.metricKind, s.metric?.type, labels(s.metric?.labels), s.resource?.type, labels(s.resource?.labels)])
    const existing = merged.get(key)
    if (existing) existing.points.push(...(s.points || []))
    else merged.set(key, { ...s, points: [...(s.points || [])] })
  }
  for (const s of merged.values()) {
    if (s.metricKind !== (gauge ? 'GAUGE' : 'DELTA')) continue
    if (gauge && Date.parse(s.metric?.labels?.window_start_time) !== start.getTime()) continue
    const points = (s.points || []).filter((p: any) => {
      const end = Date.parse(p.interval?.endTime), begin = Date.parse(p.interval?.startTime)
      return end > start.getTime() && end <= now.getTime() && (gauge || begin >= start.getTime())
    }).sort((a: any, b: any) => Date.parse(b.interval.endTime) - Date.parse(a.interval.endTime))
    const seen = new Set<string>()
    for (const p of gauge ? points.slice(0, 1) : points) {
      const key = p.interval.startTime + '/' + p.interval.endTime
      if (seen.has(key)) continue
      seen.add(key)
      const value = Number(p.value?.int64Value)
      if (!Number.isSafeInteger(value) || value < 0) continue
      total += value; count++; latest = Math.max(latest, Date.parse(p.interval.endTime))
    }
  }
  return count && Number.isSafeInteger(total) ? { used: total, observedAt: new Date(latest).toISOString() } : null
}

@Injectable()
export class GoogleQuotaService {
  private cache = new Map<string, { expires: number; value: any }>()
  private pending = new Map<string, Promise<any>>()
  constructor(@InjectRepository(GoogleQuotaCredential) private readonly credentials: Repository<GoogleQuotaCredential>) {}

  private async request(url: string, token?: string, form?: Record<string, string>) {
    const response = await fetch(url, { method: form ? 'POST' : 'GET',
      headers: form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : { Authorization: `Bearer ${token}` },
      body: form ? new URLSearchParams(form) : undefined, signal: AbortSignal.timeout(20000) })
    const body: any = await response.json()
    if (!response.ok) throw apiError(response.status, body)
    return body
  }
  private async pages(url: URL, token: string, field: string) {
    const rows: any[] = []
    for (let page = 0; page < 100; page++) {
      const data = await this.request(url.toString(), token)
      rows.push(...(data[field] || []))
      if (!data.nextPageToken) return rows
      url.searchParams.set('pageToken', data.nextPageToken)
    }
    throw new BadRequestException('配额数据分页未完整读取，本次不显示余额。')
  }
  async authorize(config: { appId: string; appSecret: string }, code: string, redirectUri: string, verifier: string) {
    const projectNumber = youtubeProjectNumber(config.appId)
    if (!projectNumber) throw new BadRequestException('无法识别 Google Cloud 项目')
    const tokens = await this.request('https://oauth2.googleapis.com/token', undefined, {
      client_id: config.appId, client_secret: config.appSecret, code, redirect_uri: redirectUri,
      code_verifier: verifier, grant_type: 'authorization_code',
    })
    if (!CLOUD_READ_SCOPES.every(scope => String(tokens.scope || '').split(' ').includes(scope)) || !tokens.refresh_token) throw new BadRequestException('未获得 Cloud 只读离线授权，请重新同意权限。')
    await this.credentials.save({ projectNumber, appId: config.appId, appSecret: config.appSecret, refreshToken: tokens.refresh_token })
    for (const key of this.cache.keys()) if (key.startsWith(projectNumber + ':')) this.cache.delete(key)
  }
  async read(projectNumber: string, now = new Date()) {
    const cred = await this.credentials.findOneBy({ projectNumber })
    if (!cred) return { connected: false, status: 'authorization_required', metrics: [], message: '连接一次 Google Cloud 只读授权后自动获取，无需手动填写额度。' }
    const key = projectNumber + ':' + quotaDay(now)
    const cached = this.cache.get(key)
    if (cached && cached.expires > Date.now()) return cached.value
    if (this.pending.has(key)) return this.pending.get(key)
    const work = this.fetchQuota(cred, now).catch(e => ({ connected: true, status: e instanceof QuotaQueryError ? e.quotaStatus : 'error', metrics: [], checkedAt: now.toISOString(), message: e instanceof BadRequestException ? e.message : 'Google Cloud 连接失败，稍后自动重试。' }))
    this.pending.set(key, work)
    try { const value = await work; this.cache.set(key, { expires: Date.now() + 60000, value }); return value }
    finally { this.pending.delete(key) }
  }
  private async fetchQuota(cred: GoogleQuotaCredential, now: Date) {
    const token = await this.request('https://oauth2.googleapis.com/token', undefined, { client_id: cred.appId, client_secret: cred.appSecret, refresh_token: cred.refreshToken, grant_type: 'refresh_token' })
    if (!token.access_token) throw new BadRequestException('未获得 Cloud 访问令牌，请重新连接。')
    const base = `projects/${cred.projectNumber}`
    const limitsUrl = new URL(`https://serviceusage.googleapis.com/v1beta1/${base}/services/youtube.googleapis.com/consumerQuotaMetrics`)
    limitsUrl.search = new URLSearchParams({ view: 'FULL', pageSize: '200' }).toString()
    const limits = dailyLimits(await this.pages(limitsUrl, token.access_token, 'metrics'))
    if (!limits.length) throw new BadRequestException('Google 未返回 YouTube 每日配额指标，当前余额未知。')
    const start = quotaStart(now)
    const readSeries = async (type: string) => {
      const url = new URL(`https://monitoring.googleapis.com/v3/${base}/timeSeries`)
      url.search = new URLSearchParams({ filter: `resource.type="consumer_quota" AND resource.labels.service="youtube.googleapis.com" AND metric.type="${PREFIX}${type}"`, 'interval.startTime': start.toISOString(), 'interval.endTime': now.toISOString(), view: 'FULL', pageSize: '100000' }).toString()
      return this.pages(url, token.access_token, 'timeSeries')
    }
    let gauge: any[], delta: any[]
    try {
      [gauge, delta] = await Promise.all([readSeries('ratev2/net_usage'), readSeries('rate/net_usage')])
    } catch (e) {
      // Limits are still useful even when Monitoring is unavailable. Never turn absence into zero.
      return { connected: true, status: e instanceof QuotaQueryError ? e.quotaStatus : 'error', checkedAt: now.toISOString(), quotaDay: quotaDay(now),
        metrics: limits.map(l => ({ ...l, used: null, remaining: null, observedAt: null, delayed: true, stale: true })),
        message: e instanceof BadRequestException ? e.message : '已获取额度上限，但用量监控暂时不可用，稍后自动重试。' }
    }
    const metrics = limits.map(l => {
      const match = (s: any) => s.metric?.labels?.quota_metric === l.metric
      const usage = rateUsage(gauge.filter(s => match(s) && s.metric?.labels?.limit_name === l.limitName), start, now, true)
        || rateUsage(delta.filter(match), start, now, false)
      return { ...l, used: usage?.used ?? null, remaining: usage && l.dailyLimit !== null ? Math.max(0, l.dailyLimit - usage.used) : null,
        observedAt: usage?.observedAt ?? null, delayed: true, stale: usage ? now.getTime() - Date.parse(usage.observedAt) > 600000 : true }
    })
    return { connected: true, status: 'connected', checkedAt: now.toISOString(), quotaDay: quotaDay(now), metrics,
      message: metrics.some(m => m.used === null) ? '部分指标尚无监控数据，显示未知；不能把未返回的数据当作 0。' : '已自动获取 Google Cloud 数据；监控采样及传输可能延迟数分钟。' }
  }
}
