import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator'

export class CreatePlatformConfigDto {
  @ApiProperty({ description: '平台编码', example: 'douyin_cn' })
  @IsString()
  code: string

  @ApiProperty({ description: '平台名称', example: '国产抖音' })
  @IsString()
  name: string

  @ApiPropertyOptional({ description: '是否启用', example: true, default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @ApiPropertyOptional({ description: '应用ID / client_key / client_id', example: 'awxxxxx' })
  @IsOptional()
  @IsString()
  appId?: string

  @ApiPropertyOptional({ description: '应用密钥 client_secret' })
  @IsOptional()
  @IsString()
  appSecret?: string

  @ApiPropertyOptional({ description: '访问令牌 access_token' })
  @IsOptional()
  @IsString()
  accessToken?: string

  @ApiPropertyOptional({ description: '刷新令牌 refresh_token（油管必填）' })
  @IsOptional()
  @IsString()
  refreshToken?: string

  @ApiPropertyOptional({ description: '授权用户 open_id（抖音必填）' })
  @IsOptional()
  @IsString()
  openId?: string

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string

  @ApiPropertyOptional({ description: '额外配置（JSON 对象）' })
  @IsOptional()
  @IsObject()
  extra?: Record<string, any>
}
