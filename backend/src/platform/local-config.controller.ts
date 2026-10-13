import { Body, Controller, ForbiddenException, Header, Post, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Request } from 'express'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { LocalConfigService } from './local-config.service'

@ApiTags('本机配置备份')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('local-config')
export class LocalConfigController {
  constructor(private readonly service: LocalConfigService) {}
  private localOnly(req: Request) {
    // Ignore forwarded headers: environment files are only editable directly on this machine.
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')) {
      throw new ForbiddenException('配置文件操作仅支持在服务器本机访问')
    }
  }
  @Post('backup')
  @Header('Cache-Control', 'no-store')
  backup(@Req() req: Request) {
    this.localOnly(req)
    return this.service.saveBackup()
  }
  @Post('preview')
  @Header('Cache-Control', 'no-store')
  preview(@Req() req: Request, @Body() body: unknown) {
    this.localOnly(req)
    return this.service.preview(body)
  }
  @Post('import')
  @Header('Cache-Control', 'no-store')
  importConfig(@Req() req: Request, @Body() body: unknown) {
    this.localOnly(req)
    return this.service.importConfig(body)
  }
}
