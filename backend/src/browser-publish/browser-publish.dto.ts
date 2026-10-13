import { IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator'

export class BrowserAccountDto {
  @IsString() @Matches(/^[a-zA-Z0-9._]{2,24}$/)
  username: string
}
export class BrowserJobDto {
  @IsUUID() accountId: string
  @IsString() @Matches(/^[^\\/]+\.(mp4|mov|webm)$/i) videoFilename: string
  @IsString() @MinLength(1) @MaxLength(2200) caption: string
}
export class BrowserResultDto {
  @IsString() @MaxLength(300) url: string
}

export class WebPublicationDto {
  @IsUUID() accountId: string
  @IsString() @MinLength(1) @MaxLength(2200) caption: string
  @IsString() @MaxLength(300) url: string
}
