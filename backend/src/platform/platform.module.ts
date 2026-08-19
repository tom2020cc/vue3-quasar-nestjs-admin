import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PlatformConfig } from './entities/platform-config.entity'
import { PlatformConfigService } from './platform-config.service'
import { PlatformConfigController } from './platform-config.controller'
import { OAuthService } from './oauth.service'
import { OAuthController } from './oauth.controller'
import { YoutubeController } from './youtube.controller'
import { TiktokController } from './tiktok.controller'
import { PlatformAdapterFactory } from './adapters/platform-adapter.factory'
import { YoutubeAdapter } from './adapters/youtube.adapter'
import { DouyinAdapter } from './adapters/douyin.adapter'
import { TiktokAdapter } from './adapters/tiktok.adapter'
import { KuaishouAdapter } from './adapters/kuaishou.adapter'
import { FacebookAdapter } from './adapters/facebook.adapter'
import { InstagramAdapter } from './adapters/instagram.adapter'
import { StorageModule } from './storage/storage.module'

@Module({
  imports: [TypeOrmModule.forFeature([PlatformConfig]), StorageModule],
  controllers: [PlatformConfigController, OAuthController, YoutubeController, TiktokController],
  providers: [
    PlatformConfigService,
    OAuthService,
    PlatformAdapterFactory,
    YoutubeAdapter,
    DouyinAdapter,
    TiktokAdapter,
    KuaishouAdapter,
    FacebookAdapter,
    InstagramAdapter,
  ],
  // 导出给发布模块使用：配置服务 + 适配器工厂 + 对象存储
  exports: [PlatformConfigService, PlatformAdapterFactory, StorageModule],
})
export class PlatformModule {}
