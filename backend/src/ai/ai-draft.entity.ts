import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity('ai_folder_draft')
export class AiFolderDraft {
  @PrimaryColumn() ownerId: number
  @PrimaryColumn() folder: string
  @Column({ type: 'simple-json' }) data: Record<string, any>
  @Column({ default: 1 }) revision: number
  @Column() updatedAt: string
}
