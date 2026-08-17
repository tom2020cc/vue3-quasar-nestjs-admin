import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { PlatformConfigService } from './platform-config.service'
import { PlatformAdapterFactory } from './adapters/platform-adapter.factory'
import { CreatePlatformConfigDto } from './dto/create-platform-config.dto'
import { UpdatePlatformConfigDto } from './dto/update-platform-config.dto'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

@ApiTags('平台配置')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('platform')
export class PlatformConfigController {
  constructor(
    private readonly platformConfigService: PlatformConfigService,
    private readonly factory: PlatformAdapterFactory,
  ) {}

  // 平台元信息列表（平台编码、名称、支持的尺寸、所需配置字段、接口地址）
  @ApiOperation({ summary: '获取平台定义列表', description: '返回平台元信息与接口说明' })
  @Get('list')
  list() {
    return this.factory.listMeta()
  }

  @ApiOperation({ summary: '获取平台配置（含元信息）', description: '返回各平台元信息 + 已保存的凭证配置' })
  @Get()
  findAll() {
    return this.platformConfigService.findAllWithMeta()
  }

  @ApiOperation({ summary: '新增平台配置', description: '新增一个平台的接入凭证' })
  @Post()
  create(@Body() dto: CreatePlatformConfigDto) {
    return this.platformConfigService.create(dto)
  }

  @ApiOperation({ summary: '更新平台配置', description: '修改平台凭证/启用状态' })
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePlatformConfigDto) {
    return this.platformConfigService.update(id, dto)
  }

  @ApiOperation({ summary: '删除平台配置', description: '删除平台配置' })
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.platformConfigService.remove(id)
  }
}
