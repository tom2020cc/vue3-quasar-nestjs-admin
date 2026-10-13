import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { TiktokAccountService } from './tiktok-account.service'

class UpdateTiktokAccountDto {
  @IsOptional() @IsString() @MaxLength(100) label?: string
  @IsOptional() @IsBoolean() enabled?: boolean
}
@UseGuards(JwtAuthGuard)
@Controller('tiktok/accounts')
export class TiktokAccountController {
  constructor(private readonly accounts: TiktokAccountService) {}
  @Get() list() { return this.accounts.list() }
  @Patch(':id') update(@Param('id') id: string, @Body() body: UpdateTiktokAccountDto) { return this.accounts.update(id, body) }
  @Post(':id/identify') identify(@Param('id') id: string) { return this.accounts.identify(id) }
}
