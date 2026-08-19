import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { mkdirSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useGlobalPipes(new ValidationPipe({whitelist:true, transform:true}));//管道配置字段检查 + 类型转换（配合 @ValidateNested 校验批量嵌套 DTO）
  app.enableCors();//允许跨域

  // 确保上传目录存在，并托管为静态资源，供前端访问图片
  const uploadDir = join(process.cwd(), 'uploads');
  mkdirSync(uploadDir, { recursive: true });
  app.useStaticAssets(uploadDir, { prefix: '/uploads' });

  // 配置swagger
  const config = new DocumentBuilder()
  .setTitle('后台管理API')
  .setDescription('供后台管理界面调用的服务端API')
  .setVersion('1.0')
  // .addBasicAuth() //鉴权，可以输入token
  .addBearerAuth() // 添加 Bearer Token 支持
  .build();
const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api-docs', app, document);
  const port = Number(process.env.BACKEND_PORT || 5001);
  await app.listen(port);
  console.log(`http://localhost:${port}/api-docs`)
}
bootstrap();
