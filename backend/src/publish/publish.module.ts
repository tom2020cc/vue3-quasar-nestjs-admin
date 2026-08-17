import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PublishTask } from './entities/publish-task.entity'
import { PublishRecord } from './entities/publish-record.entity'
import { PublishService } from './publish.service'
import { PublishPollerService } from './publish-poller.service'
import { PublishController } from './publish.controller'
import { PlatformModule } from '../platform/platform.module'
import { VideoLibraryModule } from '../video-library/video-library.module'

@Module({
  imports: [
    TypeOrmModule.forFeature([PublishTask, PublishRecord]),
    PlatformModule,
    VideoLibraryModule,
  ],
  controllers: [PublishController],
  providers: [PublishService, PublishPollerService],
})
export class PublishModule {}
