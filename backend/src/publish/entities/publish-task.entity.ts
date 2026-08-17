import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

// 发布任务表：一条任务 = 一个视频 + 要发布的多个平台
@Entity()
export class PublishTask {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ comment: '视频标题' })
  title: string

  @Column({ nullable: true, comment: '视频描述/文案' })
  description: string

  @Column({ comment: '视频文件名（已上传到后端）' })
  videoFilename: string

  @Column({ comment: '视频访问地址' })
  videoUrl: string

  @Column({ comment: '视频本地路径' })
  videoPath: string

  @Column({ type: 'integer', default: 0, comment: '视频大小（字节）' })
  videoSize: number

  @Column({ type: 'integer', default: 0, comment: '视频宽度' })
  width: number

  @Column({ type: 'integer', default: 0, comment: '视频高度' })
  height: number

  @Column({ nullable: true, comment: '视频内容哈希（SHA-256，用于重复检测）' })
  videoHash: string

  @Column({ type: 'float', nullable: true, comment: '视频时长（秒）' })
  duration: number

  @Column({ type: 'text', nullable: true, comment: '视频封面（base64 data URL）' })
  cover: string

  @Column({ comment: '尺寸方向：landscape 宽屏 / portrait 窄屏' })
  orientation: string

  @Column({ default: 'publishing', comment: '任务状态：publishing / success / partial / failed / skipped' })
  status: string

  @CreateDateColumn({ comment: '创建时间' })
  createTime: Date

  @UpdateDateColumn({ comment: '更新时间' })
  updateTime: Date
}
