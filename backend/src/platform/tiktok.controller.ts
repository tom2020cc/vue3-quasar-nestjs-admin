import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { TiktokAccountService } from './tiktok-account.service'
import { TiktokAdapter } from './adapters/tiktok.adapter'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

@ApiTags('TikTok 视频')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tiktok')
export class TiktokController {
  constructor(
    private readonly accounts: TiktokAccountService,
    private readonly tiktokAdapter: TiktokAdapter,
  ) {}

  @Get('creator-info')
  async creatorInfo(@Query('accountId') accountId: string) {
    const config = await this.accounts.readyConfig(accountId)
    try { return await this.tiktokAdapter.creatorInfo(config) }
    catch (e: any) { throw new BadRequestException(e.message === 'fetch failed' || ['TimeoutError', 'AbortError'].includes(e.name) ? '连接 TikTok 超时或失败，请检查本项目后端代理，然后点击重新检查' : e.message || 'TikTok 发布设置读取失败') }
  }

  @ApiOperation({ summary: '获取 TikTok 视频', description: '拉取当前已授权 TikTok 账号已发布的视频信息' })
  @Get('videos')
  async listVideos(@Query('accountId') accountId: string) {
    const config = await this.accounts.readyConfig(accountId)
    const data = await this.tiktokAdapter.listUserVideos(config)
    return { msg: 'ok', data }
  }
}
