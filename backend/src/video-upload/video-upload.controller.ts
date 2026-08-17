import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import { extname, join } from 'path'
import { mkdirSync } from 'fs'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import {
  VideoUploadService,
  chunksDir,
  sanitizeUploadId,
  guessMime,
} from './video-upload.service'

// 视频文件存储配置：保存到 uploads/videos 目录
const videoDir = join(process.cwd(), 'uploads', 'videos')
mkdirSync(videoDir, { recursive: true })

const storage = diskStorage({
  destination: videoDir,
  filename: (req, file, callback) => {
    const randomName = Array(8)
      .fill(null)
      .map(() => Math.round(Math.random() * 9).toString(36))
      .join('')
    callback(null, `${Date.now()}-${randomName}${extname(file.originalname)}`)
  },
})

// 分片存储：每个 uploadId 一个目录，文件名固定 chunk_{index}
const chunkStorage = diskStorage({
  destination: (req, _file, callback) => {
    const uploadId = sanitizeUploadId((req.query?.uploadId as string) || '')
    const dir = join(chunksDir, uploadId)
    mkdirSync(dir, { recursive: true })
    callback(null, dir)
  },
  filename: (req, _file, callback) => {
    const chunkIndex = Number((req.query?.chunkIndex as string) || 0)
    callback(null, `chunk_${chunkIndex}`)
  },
})

@ApiTags('视频上传')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('video-upload')
export class VideoUploadController {
  constructor(private readonly service: VideoUploadService) {}

  // 单视频上传（整段），字段为 file，最大 500MB
  @ApiOperation({ summary: '上传视频（整段）', description: '将视频文件一次性上传到后端本地存储' })
  @Post('video')
  @UseInterceptors(
    FileInterceptor('file', { storage, limits: { fileSize: 500 * 1024 * 1024 } }),
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) return { msg: '未接收到文件' }
    return {
      msg: '上传成功',
      data: {
        filename: file.filename,
        url: `/uploads/videos/${file.filename}`,
        size: file.size,
        mimetype: file.mimetype,
      },
    }
  }

  // 上传单个分片（断点续传）
  @ApiOperation({ summary: '上传视频分片', description: '按 uploadId + chunkIndex 上传单个分片，供大文件断点续传' })
  @Post('chunk')
  @UseInterceptors(
    FileInterceptor('file', { storage: chunkStorage, limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadChunk(
    @UploadedFile() file: Express.Multer.File,
    @Query('uploadId') uploadId: string,
    @Query('chunkIndex') chunkIndex: string,
  ) {
    if (!file) return { msg: '未接收到分片' }
    return {
      msg: '分片上传成功',
      data: { uploadId, chunkIndex: Number(chunkIndex) },
    }
  }

  // 查询已上传的分片索引
  @ApiOperation({ summary: '查询已上传分片', description: '返回已上传的分片索引，前端据此跳过已传分片实现续传' })
  @Get('chunks')
  listChunks(@Query('uploadId') uploadId: string) {
    const uploaded = this.service.uploadedChunks(uploadId)
    return { msg: 'ok', data: { uploadId, uploaded } }
  }

  // 合并分片为最终视频
  @ApiOperation({ summary: '合并视频分片', description: '将已上传的全部分片按序合并为最终视频文件' })
  @Post('merge')
  async merge(
    @Body() body: { uploadId: string; fileName: string; totalChunks: number; mimetype?: string },
  ) {
    const result = await this.service.mergeChunks(body.uploadId, body.fileName, Number(body.totalChunks))
    if (!result.ok) {
      return { msg: `分片不完整，缺少分片：${(result.missing || []).join(', ')}` }
    }
    return {
      msg: '合并成功',
      data: {
        filename: result.filename,
        url: `/uploads/videos/${result.filename}`,
        size: result.size,
        mimetype: body.mimetype || guessMime(body.fileName),
        hash: result.hash,
      },
    }
  }
}
