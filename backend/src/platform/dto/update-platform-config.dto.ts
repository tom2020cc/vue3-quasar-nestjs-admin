import { PartialType } from '@nestjs/mapped-types'
import { CreatePlatformConfigDto } from './create-platform-config.dto'

// 更新平台配置：所有字段均可选
export class UpdatePlatformConfigDto extends PartialType(CreatePlatformConfigDto) {}
