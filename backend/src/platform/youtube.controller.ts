import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { IsIn, IsString, IsUUID, Length } from 'class-validator'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { YoutubeAccountService } from './youtube-account.service'
import { YoutubeAdapter } from './adapters/youtube.adapter'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

class CreateYoutubePlaylistDto {
  @IsUUID() accountId: string
  @IsString() @Length(1, 150) title: string
  @IsIn(['private', 'unlisted', 'public']) privacyStatus: string
}

@ApiTags('油管视频')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('youtube')
export class YoutubeController {
  constructor(
    private readonly accounts: YoutubeAccountService,
    private readonly youtubeAdapter: YoutubeAdapter,
  ) {}

  @ApiOperation({ summary: '获取油管频道视频', description: '拉取当前已授权油管账号频道下的所有视频信息' })
  @Get('videos')
  async listVideos(@Query('accountId') accountId: string) {
    const config = this.accounts.config(await this.accounts.resolve(accountId))
    const data = await this.youtubeAdapter.listChannelVideos(config)
    return { msg: 'ok', data }
  }
  @Get('playlists')
  async listPlaylists(@Query('accountId') accountId: string, @Query('summary') summary?: string) {
    const config = this.accounts.config(await this.accounts.resolve(accountId))
    return { msg: 'ok', data: await this.youtubeAdapter.listChannelPlaylists(config, summary === 'true') }
  }

  @Post('playlists')
  async createPlaylist(@Body() dto: CreateYoutubePlaylistDto) {
    const config = this.accounts.config(await this.accounts.resolve(dto.accountId))
    try { return { msg: '播放列表已创建', data: await this.youtubeAdapter.createPlaylist(config, dto.title, dto.privacyStatus) } }
    catch (e: any) { throw new BadRequestException(e.message || '创建播放列表失败') }
  }

  @Get('playlist-videos')
  async listPlaylistVideos(@Query('accountId') accountId: string, @Query('playlistId') playlistId: string) {
    const config = this.accounts.config(await this.accounts.resolve(accountId))
    return { msg: 'ok', data: await this.youtubeAdapter.listPlaylistVideos(config, playlistId) }
  }
}
