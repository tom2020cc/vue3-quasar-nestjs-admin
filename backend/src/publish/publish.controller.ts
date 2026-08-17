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
import { CreatePublishTaskDto } from './dto/create-publish-task.dto'
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
  retry(@Param('id', ParseIntPipe) id: number) {
    return this.publishService.retry(id)
  }

  @ApiOperation({ summary: '删除发布任务', description: '删除任务及其平台发布记录' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.publishService.remove(id)
  }
}
