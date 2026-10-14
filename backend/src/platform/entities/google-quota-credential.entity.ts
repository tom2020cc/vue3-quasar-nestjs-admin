import { Column, Entity, PrimaryColumn } from 'typeorm'

// Separate from channel credentials: Cloud read permission must never replace a channel token.
@Entity()
export class GoogleQuotaCredential {
  @PrimaryColumn() projectNumber: string
  @Column() appId: string
  @Column() appSecret: string
  @Column({ type: 'text' }) refreshToken: string
}
