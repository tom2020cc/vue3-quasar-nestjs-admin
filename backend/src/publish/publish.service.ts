import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { createHash } from 'crypto'
import { createReadStream, existsSync, statSync } from 'fs'
import { basename, join } from 'path'
import { PublishTask } from './entities/publish-task.entity'
import { PublishRecord } from './entities/publish-record.entity'
import { CreatePublishTaskDto } from './dto/create-publish-task.dto'
import { PlatformConfigService } from '../platform/platform-config.service'
import { PlatformAdapterFactory } from '../platform/adapters/platform-adapter.factory'
import { S3StorageService } from '../platform/storage/s3-storage.service'
import { Orientation } from '../platform/adapters/platform.interface'
import { VideoLibraryService } from '../video-library/video-library.service'

@Injectable()
export class PublishService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(PublishTask)
    private readonly taskRepo: Repository<PublishTask>,
    @InjectRepository(PublishRecord)
    private readonly recordRepo: Repository<PublishRecord>,
    private readonly configService: PlatformConfigService,
    private readonly factory: PlatformAdapterFactory,
    private readonly videoLibraryService: VideoLibraryService,
    private readonly storage: S3StorageService,
  ) {}

  // 启动时把历史发布任务回填到视频库（幂等，按哈希去重），让旧数据立即可见
  async onApplicationBootstrap() {
    const tasks = await this.taskRepo.find({ order: { id: 'ASC' } })
    for (const t of tasks) {
      try {
        await this.videoLibraryService.recordFromPublish({
          title: t.title,
          description: t.description,
          videoFilename: t.videoFilename,
          videoUrl: t.videoUrl,
          videoPath: t.videoPath,
          videoSize: t.videoSize,
          width: t.width,
          height: t.height,
          orientation: t.orientation,
          videoHash: t.videoHash,
          duration: t.duration,
          cover: t.cover,
        })
      } catch (e) {
        console.error(`回填视频库失败（任务 #${t.id}）：`, e)
      }
    }
  }

  // 创建单个任务（对外接口）：委托给 createOne
  createAndPublish(dto: CreatePublishTaskDto) {
    return this.createOne(dto)
  }

  // 批量创建：逐项校验/发布，单项失败不影响其余项，并做批内内容去重
  async createBatch(items: CreatePublishTaskDto[]) {
    const results: Array<{ index: number; ok: boolean; taskId?: number; message?: string }> = []
    const seenHashes = new Set<string>()
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      try {
        // 批内去重：同一内容哈希本次批次只发布一次，避免重复提交
        if (item.videoHash && seenHashes.has(item.videoHash)) {
          results.push({ index: i, ok: false, message: '批内重复：与前面某项内容相同，已跳过' })
          continue
        }
        if (item.videoHash) seenHashes.add(item.videoHash)
        const task = await this.createOne(item)
        results.push({ index: i, ok: true, taskId: task.id })
      } catch (e: any) {
        results.push({ index: i, ok: false, message: e?.message || '创建失败' })
      }
    }
    const success = results.filter((r) => r.ok).length
    return {
      msg: success > 0 ? '批量发布已提交' : '批量发布失败',
      total: items.length,
      success,
      failed: items.length - success,
      results,
    }
  }

  // 单个任务核心逻辑：校验平台/尺寸 → 落库 → 去重 → 入库 → 异步触发发布（不阻塞接口返回）
  private async createOne(dto: CreatePublishTaskDto): Promise<PublishTask> {
    const { orientation } = dto
    // 文件名做 basename 归一化，防止 ../../ 路径穿越引用到 uploads 目录之外的文件
    const videoFilename = basename(dto.videoFilename || '')

    // 1. 校验视频文件已上传到后端本地（且必须是文件，防止空文件名命中目录）
    if (!videoFilename) {
      throw new BadRequestException('视频文件名不能为空，请先上传视频')
    }
    const videoPath = join(process.cwd(), 'uploads', 'videos', videoFilename)
    if (!existsSync(videoPath) || !statSync(videoPath).isFile()) {
      throw new NotFoundException('视频文件不存在，请先上传视频')
    }

    // 2. 校验目标平台合法性，并强制「尺寸 → 平台」匹配
    if (!dto.platforms || dto.platforms.length === 0) {
      throw new BadRequestException('请至少选择一个目标平台')
    }
    const checked: string[] = []
    for (const code of dto.platforms) {
      const adapter = this.factory.get(code)
      if (!adapter) {
        throw new BadRequestException(`未知平台：${code}`)
      }
      if (!adapter.meta.orientations.includes(orientation as Orientation)) {
        throw new BadRequestException(
          `平台「${adapter.meta.name}」不支持${orientation === Orientation.LANDSCAPE ? '宽屏' : '窄屏'}视频`,
        )
      }
      if (!adapter.meta.available) {
        throw new BadRequestException(
          `平台「${adapter.meta.name}」暂不可用：${adapter.meta.unavailableReason || '需企业认证'}`,
        )
      }
      if (!checked.includes(code)) checked.push(code)
    }

    // 3. 计算内容哈希（优先前端传入，否则流式计算兜底），并记录元数据
    const size = statSync(videoPath).size
    let videoHash = dto.videoHash || null
    if (!videoHash) videoHash = await this.hashFile(videoPath)

    const task = await this.taskRepo.save(
      this.taskRepo.create({
        title: dto.title,
        description: dto.description || '',
        videoFilename,
        videoUrl: `/uploads/videos/${videoFilename}`,
        videoPath,
        videoSize: size,
        width: dto.width,
        height: dto.height,
        orientation,
        videoHash,
        duration: dto.duration ?? null,
        cover: dto.cover ?? null,
        status: 'publishing',
      }),
    )

    // 4. 去重检测：同一内容在同一平台已成功发布过 → 标记为「跳过（重复）」
    //    先一次性查出该内容已在哪些平台成功发布过（单次查询，避免逐平台查库）
    const publishedPlatforms = await this.findPublishedPlatforms(videoHash)
    const records: PublishRecord[] = []
    for (const code of checked) {
      const dupTaskId = publishedPlatforms.get(code)
      if (dupTaskId) {
        const name = this.factory.get(code)?.meta?.name || code
        records.push(
          this.recordRepo.create({
            taskId: task.id,
            platform: code,
            status: 'skipped',
            duplicate: true,
            message: `检测到重复：该视频已在「${name}」发布过（任务 #${dupTaskId}），已跳过`,
          }),
        )
      } else {
        records.push(this.recordRepo.create({ taskId: task.id, platform: code, status: 'pending' }))
      }
    }
    await this.recordRepo.save(records)

    // 5. 视频库入库（按内容哈希去重，重复发布只更新不新增）
    await this.videoLibraryService.recordFromPublish({
      title: task.title,
      description: task.description,
      videoFilename: task.videoFilename,
      videoUrl: task.videoUrl,
      videoPath: task.videoPath,
      videoSize: task.videoSize,
      width: task.width,
      height: task.height,
      orientation: task.orientation,
      videoHash: task.videoHash,
      duration: task.duration,
      cover: task.cover,
    })

    // 6. 异步执行发布
    this.runPublish(task.id).catch((e) => {
      console.error('发布任务执行异常：', e)
    })

    return task
  }

  // 执行某个任务下所有平台的发布
  async runPublish(taskId: number) {
    const task = await this.taskRepo.findOne({ where: { id: taskId } })
    if (!task) return

    const records = await this.recordRepo.find({ where: { taskId } })
    await Promise.allSettled(records.map((r) => this.publishOne(task, r)))

    // 汇总各平台结果，更新任务状态（处理中平台由轮询服务继续推进）
    await this.updateTaskStatus(taskId)
  }

  // 根据各平台记录状态汇总任务状态：
  //   全部成功 → success；全部结束且无成功 → failed；部分成功 → partial；仍有处理中 → publishing
  async updateTaskStatus(taskId: number) {
    const task = await this.taskRepo.findOne({ where: { id: taskId } })
    if (!task) return

    const fresh = await this.recordRepo.find({ where: { taskId } })
    if (fresh.length === 0) return

    const terminal = ['success', 'failed', 'skipped']
    const successCount = fresh.filter((r) => r.status === 'success').length
    const finishedCount = fresh.filter((r) => terminal.includes(r.status)).length

    if (successCount === fresh.length) {
      task.status = 'success'
    } else if (finishedCount === fresh.length && successCount === 0 && fresh.some((r) => r.status === 'failed')) {
      task.status = 'failed'
    } else if (finishedCount === fresh.length && successCount === 0) {
      task.status = 'skipped'
    } else if (finishedCount === fresh.length) {
      task.status = 'partial'
    } else {
      task.status = 'publishing'
    }
    await this.taskRepo.save(task)
  }

  // 单平台发布：取配置 → 判断启用/凭证 → 调适配器
  private async publishOne(task: PublishTask, record: PublishRecord) {
    // 已跳过（去重等）或已结束的记录不再处理
    if (record.status !== 'pending') return

    const adapter = this.factory.get(record.platform)
    if (!adapter) {
      record.status = 'failed'
      record.message = '未找到平台适配器'
      await this.recordRepo.save(record)
      return
    }

    let config = await this.configService.findByCode(record.platform)
    if (!config || !config.enabled) {
      record.status = 'skipped'
      record.message = '平台未配置或未启用，已跳过'
      await this.recordRepo.save(record)
      return
    }

    // 访问令牌临近/已经过期时，若该平台支持刷新则自动刷新并持久化（如 TikTok 的 24h 短期 token）
    if (adapter.refresh && this.shouldRefreshToken(config)) {
      try {
        const tokens = await adapter.refresh(config)
        await this.configService.saveTokens(config.code, tokens)
        config = (await this.configService.findByCode(config.code)) || config
      } catch (e: any) {
        console.warn(`平台「${config.name || config.code}」访问令牌自动刷新失败：`, e?.message)
      }
    }

    record.status = 'publishing'
    await this.recordRepo.save(record)

    try {
      // Instagram 等平台需要公网 URL：仅在「确实要走真实发布」时先把视频托管到对象存储，
      // 未配置凭证走模拟发布时无需对象存储（避免因未配置 STORAGE_* 而误报失败）
      let publicUrl: string | undefined
      if (adapter.requiresPublicUrl && adapter.isConfigured(config)) {
        publicUrl = await this.storage.upload(task.videoPath, 'videos/' + task.videoFilename)
      }
      const result = await adapter.publish(
        {
          filePath: task.videoPath,
          fileName: task.videoFilename,
          size: task.videoSize,
          mime: 'video/mp4',
          orientation: task.orientation as Orientation,
          title: task.title,
          description: task.description,
          publicUrl,
        },
        config,
      )
      record.message = result.message || ''
      record.externalId = result.externalId || null
      record.externalUrl = result.externalUrl || null
      record.mock = !!result.mock
      if (!result.success) {
        record.status = 'failed'
      } else if (result.pending) {
        // 已提交但仍在平台处理中（转码/审核），交由轮询服务查询最终状态
        record.status = 'processing'
        record.pollCount = 0
      } else {
        record.status = 'success'
        record.publishedAt = new Date()
      }
    } catch (e: any) {
      record.status = 'failed'
      record.message = e.message || '发布异常'
    }
    await this.recordRepo.save(record)
  }

  // 判断是否需要自动刷新访问令牌：有 refreshToken 且 token 已过期或 5 分钟内即将过期
  private shouldRefreshToken(config: {
    refreshToken?: string | null
    tokenExpiresAt?: Date | null
  }): boolean {
    if (!config.refreshToken || !config.tokenExpiresAt) return false
    return config.tokenExpiresAt.getTime() - Date.now() < 5 * 60 * 1000
  }

  // 查询某视频内容（按哈希）已在哪些平台成功发布过（单次查询，供去重检测）
  private async findPublishedPlatforms(videoHash: string | null): Promise<Map<string, number>> {
    const map = new Map<string, number>() // platform -> 已成功发布的任务 id
    if (!videoHash) return map
    const rows = await this.taskRepo
      .createQueryBuilder('task')
      .innerJoin(PublishRecord, 'record', 'record.taskId = task.id')
      .select('record.platform', 'platform')
      .addSelect('task.id', 'taskId')
      .where('record.status = :status', { status: 'success' })
      .andWhere('task.videoHash = :hash', { hash: videoHash })
      .getRawMany()
    for (const r of rows) {
      if (!map.has(r.platform)) map.set(r.platform, Number(r.taskId))
    }
    return map
  }

  // 流式计算文件 SHA-256
  private hashFile(path: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256')
      const rs = createReadStream(path)
      rs.on('data', (chunk) => hash.update(chunk))
      rs.on('end', () => resolve(hash.digest('hex')))
      rs.on('error', reject)
    })
  }

  findAll() {
    return this.taskRepo.find({
      select: {
        id: true,
        title: true,
        description: true,
        videoFilename: true,
        videoUrl: true,
        videoPath: true,
        videoSize: true,
        width: true,
        height: true,
        orientation: true,
        videoHash: true,
        duration: true,
        status: true,
        createTime: true,
        updateTime: true,
        // 不返回 cover（列表无需大字段，详情页单独取）
      },
      order: { id: 'DESC' },
    })
  }

  async findOne(id: number) {
    const task = await this.taskRepo.findOne({ where: { id } })
    if (!task) {
      throw new NotFoundException('未找到该发布任务')
    }
    const records = await this.recordRepo.find({ where: { taskId: id } })
    return { ...task, records }
  }

  // 重试：重新执行失败/跳过的平台
  async retry(id: number) {
    const task = await this.taskRepo.findOne({ where: { id } })
    if (!task) {
      throw new NotFoundException('未找到该发布任务')
    }
    const records = await this.recordRepo.find({ where: { taskId: id } })
    const toRetry = records.filter((r) => r.status === 'failed' || (r.status === 'skipped' && !r.duplicate))
    if (toRetry.length === 0) {
      return { msg: '没有可重试的平台' }
    }
    for (const r of toRetry) {
      r.status = 'pending'
      r.message = ''
      await this.recordRepo.save(r)
    }
    task.status = 'publishing'
    await this.taskRepo.save(task)
    this.runPublish(id).catch((e) => console.error('重试执行异常：', e))
    return { msg: '已重新触发发布', count: toRetry.length }
  }

  async remove(id: number) {
    const task = await this.taskRepo.findOne({ where: { id } })
    if (!task) {
      throw new NotFoundException('未找到该发布任务')
    }
    await this.recordRepo.delete({ taskId: id })
    await this.taskRepo.remove(task)
    return { msg: '删除成功' }
  }
}
