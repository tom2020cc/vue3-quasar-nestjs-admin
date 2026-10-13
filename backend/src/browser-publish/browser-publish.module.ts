import { Module } from '@nestjs/common'
import { BrowserPublishController } from './browser-publish.controller'
import { BrowserPublishService } from './browser-publish.service'
@Module({ controllers: [BrowserPublishController], providers: [BrowserPublishService] })
export class BrowserPublishModule {}
