import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

// 平台发布记录表：一条任务对应多个平台，每个平台一条记录
@Entity()
export class PublishRecord {
  @Column({ type: 'datetime', nullable: true }) youtubeDeletedAt: Date | null
  @Column({ type: 'text', nullable: true }) tiktokPrivacyLevel: string | null
  @Column({ type: 'text', nullable: true }) youtubePlaylistId: string | null
  @Column({ type: 'text', nullable: true }) youtubePlaylistTitle: string | null
  @Column({ default: false }) youtubePlaylistAdded: boolean
  @Column({ type: 'text', nullable: true }) tiktokAccountId: string | null
  @Column({ type: 'text', nullable: true }) targetTiktokOpenId: string | null
  @Column({ type: 'text', nullable: true }) targetTiktokAppId: string | null
  @Column({ type: 'text', nullable: true }) targetTiktokName: string | null

  @PrimaryGeneratedColumn()
  id: number

  @Column({ comment: '所属任务ID' })
  taskId: number

  @Column({ comment: '平台编码：douyin_cn/youtube/tiktok/kuaishou' })
  platform: string

  @Column({ type: 'text', nullable: true })
  youtubeAccountId: string | null

  @Column({ type: 'text', nullable: true })
  targetChannelId: string | null

  @Column({ type: 'text', nullable: true })
  targetChannelTitle: string | null

  @Column({ default: 'pending', comment: '状态：pending/skipped/publishing/processing/success/failed' })
  status: string

  @Column({ default: 0, comment: '已轮询次数（发布为异步时用于超时兜底）' })
  pollCount: number

  @Column({ nullable: true, comment: '结果/错误说明' })
  message: string

  @Column({ nullable: true, comment: '平台返回的视频ID' })
  externalId: string

  @Column({ nullable: true, comment: '平台视频链接' })
  externalUrl: string

  @Column({ default: false, comment: '是否为模拟发布' })
  mock: boolean

  @Column({ default: false, comment: '是否为重复视频（去重跳过）' })
  duplicate: boolean

  @Column({ nullable: true, type: 'datetime', comment: '发布时间' })
  publishedAt: Date

  @CreateDateColumn({ comment: '创建时间' })
  createTime: Date

  @UpdateDateColumn({ comment: '更新时间' })
  updateTime: Date
}
