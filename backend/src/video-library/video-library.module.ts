import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Video } from './entities/video.entity'
import { VideoLibraryService } from './video-library.service'
import { VideoLibraryController } from './video-library.controller'

@Module({
  imports: [TypeOrmModule.forFeature([Video])],
  controllers: [VideoLibraryController],
  providers: [VideoLibraryService],
  exports: [VideoLibraryService],
})
export class VideoLibraryModule {}
