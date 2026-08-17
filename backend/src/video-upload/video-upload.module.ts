import { Module } from '@nestjs/common'
import { VideoUploadController } from './video-upload.controller'
import { VideoUploadService } from './video-upload.service'

@Module({
  controllers: [VideoUploadController],
  providers: [VideoUploadService],
})
export class VideoUploadModule {}
