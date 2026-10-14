import { Module, Controller, UseGuards, Get, Post, Patch, Delete, Body, Param, Req, Query } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { AiModel } from './ai-model.entity'
import { AiService } from './ai.service'
import { AiFolderDraft } from './ai-draft.entity'
import { AiDraftService } from './ai-draft.service'

@Controller('ai')
@UseGuards(JwtAuthGuard)
class AiController {
  constructor(private readonly ai: AiService, private readonly drafts: AiDraftService) {}
  @Get('folder-draft') draft(@Req() req: any, @Query('folder') folder = '') { return this.drafts.get(req.user.userId, folder) }
  @Post('folder-draft') saveDraft(@Req() req: any, @Body() body: any) { return this.drafts.save(req.user.userId, body) }
  @Get('models') list(@Req() req: any) { return this.ai.list(req.user.userId) }
  @Post('models') create(@Req() req: any, @Body() body: any) { return this.ai.save(req.user.userId, body) }
  @Patch('models/:id') edit(@Req() req: any, @Param('id') id: string, @Body() body: any) { return this.ai.save(req.user.userId, body, id) }
  @Delete('models/:id') remove(@Req() req: any, @Param('id') id: string) { return this.ai.remove(req.user.userId, id) }
  @Post('models/:id/test') test(@Req() req: any, @Param('id') id: string) { return this.ai.test(req.user.userId, id) }
  @Post('generate') generate(@Req() req: any, @Body() body: any) { return this.ai.generate(req.user.userId, body) }
}
@Module({ imports: [TypeOrmModule.forFeature([AiModel, AiFolderDraft])], controllers: [AiController], providers: [AiService, AiDraftService] })
export class AiModule {}
