import {
  Controller,
  Get,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { VideoLibraryService } from './video-library.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

@ApiTags('视频库')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('video-library')
export class VideoLibraryController {
  constructor(private readonly videoLibraryService: VideoLibraryService) {}

  @ApiOperation({ summary: '视频库列表', description: '获取所有已入库视频（不含封面大字段）' })
  @Get()
  findAll() {
    return this.videoLibraryService.findAll()
  }

  @ApiOperation({ summary: '视频库详情', description: '获取单个视频完整信息（含封面）' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.videoLibraryService.findOne(id)
  }

  @ApiOperation({ summary: '删除视频', description: '从视频库删除一条记录' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.videoLibraryService.remove(id)
  }
}
