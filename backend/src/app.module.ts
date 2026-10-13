import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { MenuModule } from './menu/menu.module';
import { ImgUploadModule } from './img-upload/img-upload.module';
import { PlatformModule } from './platform/platform.module';
import { VideoUploadModule } from './video-upload/video-upload.module';
import { PublishModule } from './publish/publish.module';
import { VideoLibraryModule } from './video-library/video-library.module';
import { BrowserPublishModule } from './browser-publish/browser-publish.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // 加载 .env 文件配置
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: process.env.DB_DATABASE || 'database.sqlite',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],  // 自动加载实体
      synchronize: process.env.DB_SYNCHRONIZE !== 'false', // 由环境变量控制，生产环境置 false 避免自动改表丢数据
    }),
    UserModule,
    AuthModule,
    MenuModule,
    ImgUploadModule,
    PlatformModule,
    VideoUploadModule,
    PublishModule,
    VideoLibraryModule,
    BrowserPublishModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
