import { BadRequestException, Controller, Get, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { PlatformConfigService } from './platform-config.service'
import { YoutubeAdapter } from './adapters/youtube.adapter'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

@ApiTags('油管视频')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('youtube')
export class YoutubeController {
  constructor(
    private readonly configService: PlatformConfigService,
    private readonly youtubeAdapter: YoutubeAdapter,
  ) {}

  @ApiOperation({ summary: '获取油管频道视频', description: '拉取当前已授权油管账号频道下的所有视频信息' })
  @Get('videos')
  async listVideos() {
    const config = await this.configService.findByCode('youtube')
    if (!config || !config.refreshToken || !config.appId || !config.appSecret) {
      throw new BadRequestException('请先在「平台配置」完成油管授权（需 appId、appSecret 与 refreshToken）')
    }
    const data = await this.youtubeAdapter.listChannelVideos(config)
    return { msg: 'ok', data }
  }
}
