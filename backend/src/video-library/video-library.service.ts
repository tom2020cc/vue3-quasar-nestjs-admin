import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Video } from './entities/video.entity'

// 入库所需的视频因素（由发布流程传入，与 Video 实体字段对齐）
export interface RecordVideoInput {
  title: string
  description?: string
  videoFilename: string
  videoUrl: string
  videoPath: string
  videoSize: number
  width: number
  height: number
  orientation: string
  videoHash?: string | null
  duration?: number | null
  cover?: string | null
}

@Injectable()
export class VideoLibraryService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepo: Repository<Video>,
  ) {}

  // 列表：视频库以「封面可视化」为主，直接返回全部字段（含 cover，缩略图较小）
  findAll() {
    return this.videoRepo.find({ order: { id: 'DESC' } })
  }

  async findOne(id: number) {
    const video = await this.videoRepo.findOne({ where: { id } })
    if (!video) {
      throw new NotFoundException('未找到该视频')
    }
    return video
  }

  async remove(id: number) {
    const video = await this.videoRepo.findOne({ where: { id } })
    if (!video) {
      throw new NotFoundException('未找到该视频')
    }
    await this.videoRepo.remove(video)
    return { msg: '删除成功' }
  }

  // 按内容哈希去重入库：同一视频内容只保留一条记录，重复发布时刷新元数据
  async recordFromPublish(data: RecordVideoInput) {
    let existing: Video | null = null
    // 1) 优先按内容哈希匹配（最可靠）
    if (data.videoHash) {
      existing = await this.videoRepo.findOne({ where: { videoHash: data.videoHash } })
    }
    // 2) 回退：按文件名匹配
    if (!existing) {
      existing = await this.videoRepo.findOne({ where: { videoFilename: data.videoFilename } })
    }

    if (existing) {
      // 更新元数据（标题/描述/尺寸/时长/封面等可能变化）
      existing.title = data.title
      existing.description = data.description || existing.description
      existing.videoSize = data.videoSize
      existing.width = data.width
      existing.height = data.height
      existing.orientation = data.orientation
      if (data.videoHash) existing.videoHash = data.videoHash
      if (data.duration != null) existing.duration = data.duration
      if (data.cover) existing.cover = data.cover
      return this.videoRepo.save(existing)
    }

    const video = this.videoRepo.create({
      title: data.title,
      description: data.description || '',
      videoFilename: data.videoFilename,
      videoUrl: data.videoUrl,
      videoPath: data.videoPath,
      videoSize: data.videoSize,
      width: data.width,
      height: data.height,
      orientation: data.orientation,
      videoHash: data.videoHash || null,
      duration: data.duration ?? null,
      cover: data.cover || null,
    })
    return this.videoRepo.save(video)
  }
}
