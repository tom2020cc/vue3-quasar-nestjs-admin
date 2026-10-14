import { Column, Entity, PrimaryColumn } from 'typeorm'

// A dated console observation, not a live balance or an API credential.
@Entity('youtube_quota_snapshot')
export class YoutubeQuotaSnapshot {
  @PrimaryColumn() projectNumber: string
  @Column({ type: 'integer' }) dailyLimit: number
  @Column({ type: 'integer' }) used: number
  @Column() observedAt: string
}
