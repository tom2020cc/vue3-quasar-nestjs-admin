import { Body, Controller, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { FileInterceptor } from '@nestjs/platform-express'
import { diskStorage, memoryStorage } from 'multer'
import { extname, join } from 'path'
import { mkdirSync } from 'fs'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CHUNK_SIZE, randomVideoName, UploadManifest, VideoUploadService } from './video-upload.service'

const videoDir = join(process.cwd(), 'uploads', 'videos')
mkdirSync(videoDir, { recursive: true })

@ApiTags('视频上传')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('video-upload')
export class VideoUploadController {
  constructor(private readonly service: VideoUploadService) {}

  // Preserve the existing whole-file API for integrations; the UI uses resumable sessions.
  @Post('video')
  @UseInterceptors(FileInterceptor('file', { storage: diskStorage({ destination: videoDir,
    filename: (_req, file, callback) => callback(null, randomVideoName(extname(file.originalname))),
  }), limits: { files: 1 } }))
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) return { msg: '未接收到文件' }
    return { msg: '上传成功', data: { filename: file.filename, url: `/uploads/videos/${file.filename}`, size: file.size, mimetype: file.mimetype } }
  }

  @Post('session')
  initialize(@Req() req: any, @Body() body: UploadManifest) {
    return { data: this.service.initialize(Number(req.user.userId), body) }
  }

  @Post('chunk')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: CHUNK_SIZE + 1, files: 1 } }))
  uploadChunk(@Req() req: any, @UploadedFile() file: Express.Multer.File, @Query('uploadId') id: string, @Query('chunkIndex') index: string) {
    return { data: this.service.commitChunk(Number(req.user.userId), id, Number(index), file?.buffer) }
  }

  @Post('merge')
  async merge(@Req() req: any, @Body() body: { uploadId: string }) {
    return { msg: '合并成功', data: await this.service.merge(Number(req.user.userId), body.uploadId) }
  }
}
