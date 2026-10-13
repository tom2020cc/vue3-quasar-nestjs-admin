import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { TIKTOK_PRIVACY_LEVELS } from '../../platform/adapters/tiktok-privacy'
import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsUUID,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator'

export class CreatePublishTaskDto {
  @ApiProperty({ description: '视频标题', example: '我的第一个视频' })
  @IsString()
  title: string

  @ApiPropertyOptional({ description: '视频描述/文案' })
  @IsOptional()
  @IsString()
  description?: string

  @ApiProperty({ description: '已上传到后端的视频文件名', example: '1718xxxx.mp4' })
  @IsString()
  videoFilename: string

  @ApiProperty({
    description: '尺寸方向：landscape 宽屏 / portrait 窄屏',
    enum: ['landscape', 'portrait'],
    example: 'landscape',
  })
  @IsIn(['landscape', 'portrait'])
  orientation: 'landscape' | 'portrait'

  @ApiProperty({ description: '视频宽度', example: 1920 })
  @IsNumber()
  width: number

  @ApiProperty({ description: '视频高度', example: 1080 })
  @IsNumber()
  height: number

  @ApiPropertyOptional({ description: '视频内容哈希（SHA-256），由上传接口返回，用于重复检测' })
  @IsOptional()
  @IsString()
  videoHash?: string

  @ApiPropertyOptional({ description: '视频时长（秒）', example: 12.5 })
  @IsOptional()
  @IsNumber()
  duration?: number

  @ApiPropertyOptional({ description: '视频封面（base64 data URL）' })
  @IsOptional()
  @IsString()
  cover?: string

  @ApiPropertyOptional({ description: 'YouTube 账号 ID；选择 YouTube 平台时必须提供' })
  @IsOptional()
  @IsString()
  youtubeAccountId?: string

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_-]{1,150}$/)
  youtubePlaylistId?: string

  @IsOptional()
  @IsUUID()
  tiktokAccountId?: string

  @IsOptional()
  @IsIn(TIKTOK_PRIVACY_LEVELS)
  tiktokPrivacyLevel?: string

  @ApiProperty({
    description: '目标平台编码数组',
    example: ['douyin_cn', 'youtube'],
    isArray: true,
  })
  @IsArray()
  platforms: string[]
}

export class RetryPublishDto {
  @IsOptional()
  @IsIn(TIKTOK_PRIVACY_LEVELS)
  tiktokPrivacyLevel?: string
}

// 批量发布请求体：一次提交多个视频的发布任务（逐项校验、逐项错误隔离）
export class BatchCreatePublishTaskDto {
  @ApiProperty({
    description: '批量发布项（每个视频一项）',
    type: [CreatePublishTaskDto],
    isArray: true,
  })
  @IsArray()
  @ArrayMinSize(1, { message: '批量发布至少需要 1 个视频' })
  @ValidateNested({ each: true })
  @Type(() => CreatePublishTaskDto)
  items: CreatePublishTaskDto[]
}
