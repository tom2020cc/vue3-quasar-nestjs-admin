import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { YoutubeAccount } from './entities/youtube-account.entity'
import { YoutubeQuotaSnapshot } from './entities/youtube-quota.entity'

import { GoogleQuotaService } from './google-quota.service'
import { quotaDay, nextQuotaReset, youtubeProjectNumber } from './quota-time'
export { quotaDay, nextQuotaReset, youtubeProjectNumber } from './quota-time'
@Injectable()
export class YoutubeQuotaService {
  constructor(
    @InjectRepository(YoutubeAccount) private readonly accounts: Repository<YoutubeAccount>,
    @InjectRepository(YoutubeQuotaSnapshot) private readonly snapshots: Repository<YoutubeQuotaSnapshot>,
    private readonly cloud: GoogleQuotaService,
  ) {}
  async list(now = new Date()) {
    const accounts = await this.accounts.find({ order: { createTime: 'ASC' } })
    const snapshots = await this.snapshots.find()
    const groups = new Map<string, any>()
    for (const a of accounts) {
      const projectNumber = youtubeProjectNumber(a.appId)
      const key = projectNumber || `unknown-${a.id}`
      if (!groups.has(key)) {
        const record = snapshots.find(s => s.projectNumber === projectNumber)
        groups.set(key, { key, projectNumber,
          consoleUrl: 'https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas' + (projectNumber ? `?project=${projectNumber}` : ''),
          snapshot: record ? { dailyLimit: record.dailyLimit, used: record.used, remaining: Math.max(0, record.dailyLimit - record.used), observedAt: record.observedAt, quotaDay: quotaDay(new Date(record.observedAt)), expired: quotaDay(new Date(record.observedAt)) !== quotaDay(now), source: 'manual_console' } : null,
          channels: [] })
      }
      groups.get(key).channels.push({ id: a.id, title: a.channelTitle || a.label || '待识别频道', channelId: a.channelId, enabled: a.enabled })
    }
    await Promise.all([...groups.values()].map(async group => {
      group.cloud = group.projectNumber ? await this.cloud.read(group.projectNumber, now) : { connected: false, status: 'unknown_project', metrics: [], message: '请检查频道应用配置' }
    }))
    return { serverTime: now.toISOString(), nextResetAt: nextQuotaReset(now), groups: [...groups.values()] }
  }
  async save(projectNumber: string, input: { dailyLimit: number; used: number; observedAt: string }, now = new Date()) {
    if (!/^\d+$/.test(projectNumber) || !Number.isSafeInteger(input.dailyLimit) || input.dailyLimit <= 0 || !Number.isSafeInteger(input.used) || input.used < 0 || !Number.isFinite(Date.parse(input.observedAt)) || Date.parse(input.observedAt) > now.getTime() + 60000) throw new BadRequestException('请输入有效的配额数值和实际查看时间，时间不能晚于现在')
    const accounts = await this.accounts.find()
    if (!accounts.some(a => youtubeProjectNumber(a.appId) === projectNumber)) throw new BadRequestException('项目不属于当前已配置的 YouTube 频道')
    await this.snapshots.save({ projectNumber, dailyLimit: input.dailyLimit, used: input.used, observedAt: new Date(input.observedAt).toISOString() })
    return this.list(now)
  }
}
