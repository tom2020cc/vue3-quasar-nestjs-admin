import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import { OAuthService } from './oauth.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

@ApiTags('平台OAuth授权')
@Controller('platform')
export class OAuthController {
  constructor(private readonly oauthService: OAuthService) {}

  // 获取授权跳转地址（需登录，前端拿到 url 后让浏览器跳转）
  @ApiOperation({ summary: '获取OAuth授权地址', description: '返回跳转到平台授权页的地址' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':code/oauth/url')
  buildUrl(@Param('code') code: string) {
    return this.oauthService.buildAuthUrl(code)
  }

  // 授权回调：由平台方重定向到此处，无需登录态
  // 处理成功后浏览器跳回前端「平台配置」页并携带结果参数
  @ApiOperation({ summary: 'OAuth授权回调', description: '平台授权完成后重定向到本地址' })
  @Get(':code/oauth/callback')
  async callback(
    @Param('code') code: string,
    @Query() query: { code?: string; state?: string; error?: string; error_description?: string },
    @Res() res: Response,
  ) {
    try {
      const platform = await this.oauthService.handleCallback(code, query)
      res.redirect(`${this.oauthService.frontendUrl}/#/platform-config?oauth=success&platform=${platform}`)
    } catch (e: any) {
      res.redirect(
        `${this.oauthService.frontendUrl}/#/platform-config?oauth=error&message=${encodeURIComponent(e.message || '授权失败')}`,
      )
    }
  }

  // 刷新令牌（需登录）
  @ApiOperation({ summary: '刷新访问令牌', description: '用 refresh_token 刷新 access_token' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(':code/oauth/refresh')
  refresh(@Param('code') code: string) {
    return this.oauthService.refresh(code)
  }
}
