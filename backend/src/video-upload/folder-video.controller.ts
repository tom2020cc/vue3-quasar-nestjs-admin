import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common'
import { IsString, MaxLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { FolderVideoService } from './folder-video.service'

class ImportFolderVideoDto {
  @IsString() @MaxLength(1000) path: string
  @IsString() @MaxLength(64) ticket: string
}

@Controller('video-folders')
@UseGuards(JwtAuthGuard)
export class FolderVideoController {
  constructor(private readonly service: FolderVideoService) {}
  @Get()
  async scan(@Req() req: any, @Query('folder') folder = '') {
    return { data: await this.service.scan(Number(req.user.userId), folder) }
  }
  @Post('import')
  async importVideo(@Req() req: any, @Body() body: ImportFolderVideoDto) {
    return { data: await this.service.importVideo(Number(req.user.userId), body.path, body.ticket) }
  }
}
