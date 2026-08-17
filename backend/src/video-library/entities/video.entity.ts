import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

// 视频库表：记录已上传视频的完整因素（大小/封面/横竖屏/分辨率/时长/内容哈希等）
// 发布时自动入库，按内容哈希去重，避免同一视频重复记录
@Entity()
export class Video {
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

  @Column({ type: 'integer', default: 0, comment: '视频宽度（像素）' })
  width: number

  @Column({ type: 'integer', default: 0, comment: '视频高度（像素）' })
  height: number

  @Column({ comment: '尺寸方向：landscape 宽屏 / portrait 窄屏' })
  orientation: string

  @Column({ nullable: true, comment: '视频内容哈希（SHA-256，用于去重）' })
  videoHash: string

  @Column({ type: 'float', nullable: true, comment: '视频时长（秒）' })
  duration: number

  @Column({ type: 'text', nullable: true, comment: '视频封面（base64 data URL）' })
  cover: string

  @CreateDateColumn({ comment: '创建时间' })
  createTime: Date

  @UpdateDateColumn({ comment: '更新时间' })
  updateTime: Date
}
