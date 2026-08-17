import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

// 平台配置表：保存每个视频平台的接入凭证
@Entity()
export class PlatformConfig {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ unique: true, comment: '平台编码：douyin_cn/youtube/tiktok/kuaishou' })
  code: string

  @Column({ comment: '平台名称' })
  name: string

  @Column({ default: true, comment: '是否启用（关闭后发布时跳过该平台）' })
  enabled: boolean

  @Column({ nullable: true, comment: '应用ID（抖音 client_key / 油管 client_id / TikTok client_key）' })
  appId: string

  @Column({ nullable: true, comment: '应用密钥 client_secret' })
  appSecret: string

  @Column({ nullable: true, comment: '访问令牌 access_token' })
  accessToken: string

  @Column({ nullable: true, comment: '刷新令牌 refresh_token（油管必填，用于换取 access_token）' })
  refreshToken: string

  @Column({ nullable: true, type: 'datetime', comment: '令牌过期时间' })
  tokenExpiresAt: Date

  @Column({ nullable: true, comment: '授权用户 open_id（抖音必填）' })
  openId: string

  @Column({ nullable: true, type: 'simple-json', comment: '额外配置（JSON）' })
  extra: Record<string, any>

  @Column({ nullable: true, comment: '备注' })
  remark: string

  @CreateDateColumn({ comment: '创建时间' })
  createTime: Date

  @UpdateDateColumn({ comment: '更新时间' })
  updateTime: Date
}
