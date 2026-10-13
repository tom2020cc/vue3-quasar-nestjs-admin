import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { PublishRecord } from './entities/publish-record.entity'
import { PublishService } from './publish.service'
import { PlatformConfigService } from '../platform/platform-config.service'
import { PlatformAdapterFactory } from '../platform/adapters/platform-adapter.factory'

// 单轮轮询的并发上限
const POLL_CONCURRENCY = 5

// 发布状态轮询服务
// 发布接口是异步的：视频提交到平台后需经历转码/审核，最终状态需周期性查询。
// 本服务用原生 setInterval 周期扫描「processing」状态的记录，调用各平台
// queryStatus 获取最终状态并落库，再汇总对应任务的整体状态。
@Injectable()
export class PublishPollerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | null = null
  private running = false // 防止上一轮未结束又触发下一轮

  constructor(
    @InjectRepository(PublishRecord)
    private readonly recordRepo: Repository<PublishRecord>,
    private readonly configService: PlatformConfigService,
    private readonly factory: PlatformAdapterFactory,
    private readonly publishService: PublishService,
    private readonly env: ConfigService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(
      () => this.poll().catch((e) => console.error('发布状态轮询异常：', e)),
      this.intervalMs,
    )
    console.log(
      `发布状态轮询已启动（每 ${this.intervalMs}ms，最多 ${this.maxAttempts} 次）`,
    )
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer)
  }

  private get intervalMs(): number {
    const v = Number(this.env.get('POLL_INTERVAL_MS'))
    return Number.isFinite(v) && v > 0 ? v : 15000
  }

  private get maxAttempts(): number {
    const v = Number(this.env.get('POLL_MAX_ATTEMPTS'))
    return Number.isFinite(v) && v > 0 ? v : 20
  }

  // 一轮轮询：找出所有处理中的记录，并发查询并落库，最后汇总任务状态
  async poll() {
    if (this.running) return
    this.running = true
    try {
      const records = await this.recordRepo.find({ where: { status: 'processing' } })
      if (records.length === 0) return

      const taskIds = new Set<number>()
      for (const record of records) taskIds.add(record.taskId)

      // 并发轮询（带并发上限，避免一次性打满外部平台接口）
      await this.runWithConcurrency(records, (record) => this.pollOne(record), POLL_CONCURRENCY)

      // 每条记录状态变化后，重新汇总其所属任务状态
      for (const taskId of taskIds) {
        await this.publishService.updateTaskStatus(taskId)
      }
    } finally {
      this.running = false
    }
  }

  // 以固定并发度执行任务，单个失败不影响其余项
  private async runWithConcurrency<T>(
    items: T[],
    worker: (item: T) => Promise<void>,
    limit: number,
  ) {
    let index = 0
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const item = items[index++]
        try {
          await worker(item)
        } catch (e) {
          console.error('轮询单条记录异常：', e)
        }
      }
    })
    await Promise.allSettled(runners)
  }

  private async pollOne(record: PublishRecord) {
    record.pollCount = (record.pollCount || 0) + 1

    // 模拟发布：本地模拟「处理中 → 完成」，第 2 次轮询即视为成功
    if (record.mock) {
      if (record.pollCount >= 2) {
        record.status = 'success'
        record.publishedAt = new Date()
        record.message = '【模拟发布】已完成'
      } else {
        record.message = `【模拟发布】平台处理中…（${record.pollCount}/${this.maxAttempts}）`
      }
      await this.recordRepo.save(record)
      return
    }

    // 超时兜底：超过最大轮询次数仍未完成，标记失败
    if (record.pollCount > this.maxAttempts) {
      record.status = 'failed'
      record.message = `轮询超时（已轮询 ${this.maxAttempts} 次，仍未完成）`
      if (record.platform === 'tiktok') record.message += '；尚未确认平台发布结果，请稍后点击“检查平台状态”，不要重复上传'
      await this.recordRepo.save(record)
      return
    }

    const adapter = this.factory.get(record.platform)
    if (!adapter || !adapter.queryStatus) {
      record.status = 'failed'
      record.message = '该平台不支持发布状态查询'
      await this.recordRepo.save(record)
      return
    }

    let config
    try { config = await this.publishService.resolveRecordConfig(record) }
    catch (e: any) {
      record.status = 'failed'
      record.message = e.message || '任务目标账号不可用'
      await this.recordRepo.save(record)
      return
    }
    if (!config) {
      record.status = 'failed'
      record.message = '平台配置不存在'
      await this.recordRepo.save(record)
      return
    }

    try {
      const result = await adapter.queryStatus({
        externalId: record.externalId || '',
        config,
        pollCount: record.pollCount,
      })
      if (result.status === 'success') {
        try { await this.publishService.completeYoutubePlaylist(record, config) }
        catch (e: any) {
          record.status = 'failed'
          record.message = `视频已上传，加入列表失败：${e.message}。重试会继续处理此视频，不重复上传。`
          await this.recordRepo.save(record)
          return
        }
        record.status = 'success'
        record.publishedAt = new Date()
        if (result.externalUrl) record.externalUrl = result.externalUrl
      } else if (result.status === 'failed') {
        record.status = 'failed'
      }
      if (result.message) record.message = result.message
      if (record.status === 'success' && record.youtubePlaylistAdded) record.message += `，已加入列表「${record.youtubePlaylistTitle}」`
    } catch (e: any) {
      // 单次查询失败不改变状态，保留原 message，下一轮继续
      record.message = `状态查询异常：${e.message}`
    }
    await this.recordRepo.save(record)
  }
}
