import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { PublishService } from './publish.service'
import { CreatePublishTaskDto, BatchCreatePublishTaskDto, RetryPublishDto } from './dto/create-publish-task.dto'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

@ApiTags('视频发布')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('publish')
export class PublishController {
  constructor(private readonly publishService: PublishService) {}

  @ApiOperation({ summary: '创建发布任务', description: '上传视频后，创建发布任务并异步发布到所选平台' })
  @Post()
  create(@Body() dto: CreatePublishTaskDto) {
    return this.publishService.createAndPublish(dto)
  }

  @ApiOperation({ summary: '批量创建发布任务', description: '一次提交多个视频，逐项校验与发布，单项失败不影响其余项' })
  @Post('batch')
  createBatch(@Body() dto: BatchCreatePublishTaskDto) {
    return this.publishService.createBatch(dto.items)
  }

  @ApiOperation({ summary: '发布任务列表', description: '获取所有发布任务' })
  @Get()
  findAll() {
    return this.publishService.findAll()
  }

  @ApiOperation({ summary: '发布任务详情', description: '获取任务详情与各平台发布记录' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.publishService.findOne(id)
  }

  @ApiOperation({ summary: '重试发布', description: '重新执行失败/跳过的平台' })
  @Post(':id/retry')
  retry(@Param('id', ParseIntPipe) id: number, @Body() dto: RetryPublishDto) {
    return this.publishService.retry(id, dto.tiktokPrivacyLevel)
  }

  @ApiOperation({ summary: '核对已中断任务的 TikTok 平台状态，不重新上传' })
  @Post(':id/tiktok-status')
  checkTiktokStatus(@Param('id', ParseIntPipe) id: number) {
    return this.publishService.checkTiktokStatus(id)
  }

  @ApiOperation({ summary: '核对 YouTube 原视频，恢复转码及列表处理，不重新上传' })
  @Post(':id/youtube-status')
  checkYoutubeStatus(@Param('id', ParseIntPipe) id: number) {
    return this.publishService.checkYoutubeStatus(id)
  }

  @Post(':id/youtube-deleted')
  releaseDeletedYoutube(@Param('id', ParseIntPipe) id: number) {
    return this.publishService.releaseDeletedYoutube(id)
  }

  @ApiOperation({ summary: '删除发布任务', description: '删除任务及其平台发布记录' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.publishService.remove(id)
  }
}
