import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { YoutubeAccountService } from './youtube-account.service'

class UpdateYoutubeAccountDto {
  @IsOptional() @IsString() @MaxLength(100) label?: string
  @IsOptional() @IsBoolean() enabled?: boolean
}
@UseGuards(JwtAuthGuard)
@Controller('youtube/accounts')
export class YoutubeAccountController {
  constructor(private readonly accounts: YoutubeAccountService) {}
  @Get() list() { return this.accounts.list() }
  @Patch(':id') update(@Param('id') id: string, @Body() body: UpdateYoutubeAccountDto) { return this.accounts.update(id, body) }
  @Post(':id/identify') identify(@Param('id') id: string) { return this.accounts.identify(id) }
}
