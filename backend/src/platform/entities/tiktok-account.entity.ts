import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm'

@Entity()
@Index(['appId', 'openId'], { unique: true })
export class TiktokAccount {
  @PrimaryColumn() id: string
  @Column({ type: 'text', nullable: true }) openId: string | null
  @Column({ default: '' }) displayName: string
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
