import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common'
import { IsInt, IsISO8601, Max, Min } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { YoutubeQuotaService } from './youtube-quota.service'
class SaveQuotaDto {
  @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) dailyLimit: number
  @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) used: number
  @IsISO8601() observedAt: string
}
@UseGuards(JwtAuthGuard)
@Controller('youtube/quota')
export class YoutubeQuotaController {
  constructor(private readonly quota: YoutubeQuotaService) {}
  @Get() list() { return this.quota.list() }
  @Put(':projectNumber') save(@Param('projectNumber') projectNumber: string, @Body() body: SaveQuotaDto) { return this.quota.save(projectNumber, body) }
}
