import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
} from '@nestjs/common';
import { ImgUploadService } from './img-upload.service';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';

// 设置文件存储的配置
const storage = diskStorage({
  destination: './uploads',
  filename: (req, file, callback) => {
    const randomName = Array(8)
      .fill(null)
      .map(() => Math.round(Math.random() * 4).toString(4))
      .join('');
    callback(null, `${Date.now()}-${randomName}${extname(file.originalname)}`);
  },
});

@Controller('img-upload')
export class ImgUploadController {
  constructor(private readonly imgUploadService: ImgUploadService) {}

  @Post('img') // 单文件上传，字段为 file
  @UseInterceptors(FileInterceptor('file', { storage }))
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      return { msg: '未接收到文件' };
    }
    return {
      msg: '上传成功',
      data: { filename: file.filename, url: `/uploads/${file.filename}` },
    };
  }

  @Post('imgs') // 多文件上传，字段为 files，最多 3 个
  @UseInterceptors(FilesInterceptor('files', 3, { storage }))
  uploadFiles(@UploadedFiles() files: Array<Express.Multer.File>) {
    if (!files || files.length === 0) {
      return { msg: '未接收到文件' };
    }
    const data = files.map((f) => ({
      filename: f.filename,
      url: `/uploads/${f.filename}`,
    }));
    return { msg: '上传成功', data };
  }
}
