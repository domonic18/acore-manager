import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'ai_token_usage' })
export class AiTokenUsage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'date' })
  date!: string;

  @Column({ type: 'varchar', length: 20 })
  scene!: string;

  @Column({ type: 'varchar', length: 64, name: 'ref_id' })
  refId!: string;

  @Column({ type: 'varchar', length: 100 })
  model!: string;

  @Column({ type: 'int', name: 'prompt_tokens', default: 0 })
  promptTokens!: number;

  @Column({ type: 'int', name: 'completion_tokens', default: 0 })
  completionTokens!: number;

  @Column({ type: 'int', name: 'total_tokens', default: 0 })
  totalTokens!: number;

  @Column({ type: 'int', name: 'duration_ms', default: 0 })
  durationMs!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
