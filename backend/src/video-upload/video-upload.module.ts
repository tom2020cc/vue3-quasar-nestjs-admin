import { Module } from '@nestjs/common'
import { VideoUploadController } from './video-upload.controller'
import { VideoUploadService } from './video-upload.service'
import { FolderVideoController } from './folder-video.controller'
import { FolderVideoService } from './folder-video.service'

@Module({
  controllers: [VideoUploadController, FolderVideoController],
  providers: [VideoUploadService, FolderVideoService],
})
export class VideoUploadModule {}
