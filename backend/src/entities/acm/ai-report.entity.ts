import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'ai_report' })
@Index('idx_ai_report_date', ['reportDate'])
export class AiReport {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 32 })
  realm!: string;

  @Column({ type: 'date', name: 'report_date' })
  reportDate!: string;

  @Column({ type: 'int', name: 'schema_version', default: 1 })
  schemaVersion!: number;

  @Column({ type: 'int', name: 'health_score', default: 0 })
  healthScore!: number;

  @Column({ type: 'varchar', length: 500, default: '' })
  summary!: string;

  @Column({ type: 'jsonb', name: 'content_json' })
  contentJson!: Record<string, any>;

  @Column({ type: 'text', name: 'content_markdown' })
  contentMarkdown!: string;

  @Column({ type: 'text', nullable: true, name: 'gm_remark' })
  gmRemark!: string | null;

  @Column({ type: 'jsonb', nullable: true, name: 'token_usage' })
  tokenUsage!: Record<string, any> | null;

  @Column({ type: 'varchar', length: 20, name: 'generated_by', default: 'cron' })
  generatedBy!: string;

  @Column({ type: 'varchar', length: 20, default: 'ok' })
  status!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
