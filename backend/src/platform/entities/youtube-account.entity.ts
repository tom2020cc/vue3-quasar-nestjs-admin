import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm'

// A credential belongs to exactly one verified channel. IDs survive configuration exports.
@Entity()
export class YoutubeAccount {
  @PrimaryColumn() id: string
  @Column({ type: 'text', nullable: true, unique: true }) channelId: string | null
  @Column({ default: '' }) channelTitle: string
  @Column({ default: '' }) label: string
  @Column({ default: true }) enabled: boolean
  @Column() appId: string
  @Column() appSecret: string
  @Column({ type: 'text', nullable: true }) accessToken: string | null
  @Column() refreshToken: string
  @Column({ type: 'datetime', nullable: true }) tokenExpiresAt: Date | null
  @CreateDateColumn() createTime: Date
  @UpdateDateColumn() updateTime: Date
}
