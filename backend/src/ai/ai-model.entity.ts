import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity('ai_model')
export class AiModel {
  @PrimaryColumn() id: string
  @Column() ownerId: number
  @Column() name: string
  @Column() provider: string
  @Column() baseUrl: string
  @Column() model: string
  @Column({ type: 'text' }) apiKey: string
  @Column({ default: true }) enabled: boolean
}
