import { Body, Controller, GoneException, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common'
import { Response } from 'express'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { BrowserPublishService } from './browser-publish.service'
import { BrowserAccountDto, BrowserResultDto, WebPublicationDto } from './browser-publish.dto'

@UseGuards(JwtAuthGuard)
@Controller('browser-publish')
export class BrowserPublishController {
  constructor(private service: BrowserPublishService) {}
  @Get() list(@Req() req: any) { return this.service.list(req.user.userId) }
  @Post('web-records') record(@Req() req: any, @Body() dto: WebPublicationDto) { return this.service.recordWebPublication(req.user.userId, dto) }
  @Post('accounts') add(@Req() req: any, @Body() dto: BrowserAccountDto) { return this.service.add(req.user.userId, dto.username) }
  @Post('accounts/:id/open') open() { throw new GoneException('已切换为 TikTok 官方网页发布，请从项目 TikTok 网页发布入口打开，不再创建独立 Chrome 或自动上传') }
  @Post('accounts/:id/verify') verify() { throw new GoneException('已切换为 TikTok 官方网页发布，请从项目 TikTok 网页发布入口打开，不再创建独立 Chrome 或自动上传') }
  @Post('jobs') create() { throw new GoneException('已切换为 TikTok 官方网页发布，请从项目 TikTok 网页发布入口打开，不再创建独立 Chrome 或自动上传') }
  @Post('jobs/:id/submit') submit() { throw new GoneException('已切换为 TikTok 官方网页发布，请从项目 TikTok 网页发布入口打开，不再创建独立 Chrome 或自动上传') }
  @Post('jobs/:id/check') check() { throw new GoneException('已切换为 TikTok 官方网页发布，请从项目 TikTok 网页发布入口打开，不再创建独立 Chrome 或自动上传') }
  @Post('jobs/:id/confirm-result') confirm(@Req() req: any, @Param('id') id: string, @Body() dto: BrowserResultDto) { return this.service.confirmResult(req.user.userId, id, dto.url) }
  @Get('jobs/:id/screenshot') screenshot(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store'); res.sendFile(this.service.screenshotPath(req.user.userId, id))
  }
}
