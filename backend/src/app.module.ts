import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { MenuModule } from './menu/menu.module';
import { ImgUploadModule } from './img-upload/img-upload.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }), // 加载 .env 文件配置
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: process.env.DB_DATABASE || 'database.sqlite',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],  // 自动加载实体
      synchronize: true, // 开发时使用，自动同步数据库表结构
    }),
    UserModule,
    AuthModule,
    MenuModule,
    ImgUploadModule,
    
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
