import { BadRequestException, Controller, Get, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { PlatformConfigService } from './platform-config.service'
import { TiktokAdapter } from './adapters/tiktok.adapter'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

@ApiTags('TikTok 视频')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tiktok')
export class TiktokController {
  constructor(
    private readonly configService: PlatformConfigService,
    private readonly tiktokAdapter: TiktokAdapter,
  ) {}

  @ApiOperation({ summary: '获取 TikTok 视频', description: '拉取当前已授权 TikTok 账号已发布的视频信息' })
  @Get('videos')
  async listVideos() {
    const config = await this.configService.findByCode('tiktok')
    if (!config || !config.appId || !config.appSecret || (!config.refreshToken && !config.accessToken)) {
      throw new BadRequestException('请先在「平台配置」完成 TikTok 授权（需 appId、appSecret 与 accessToken）')
    }
    const data = await this.tiktokAdapter.listUserVideos(config)
    return { msg: 'ok', data }
  }
}
