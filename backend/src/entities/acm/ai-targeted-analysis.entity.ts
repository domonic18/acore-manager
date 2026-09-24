import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'ai_targeted_analysis' })
@Index('idx_ai_targeted_analysis_subject', ['subjectType', 'subjectName'])
export class AiTargetedAnalysis {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 32 })
  realm!: string;

  @Column({ type: 'varchar', length: 20, name: 'subject_type' })
  subjectType!: string;

  @Column({ type: 'varchar', length: 100, name: 'subject_name' })
  subjectName!: string;

  @Column({ type: 'int', nullable: true, name: 'subject_guid' })
  subjectGuid!: number | null;

  @Column({ type: 'timestamp', name: 'time_from' })
  timeFrom!: Date;

  @Column({ type: 'timestamp', name: 'time_to' })
  timeTo!: Date;

  @Column({ type: 'varchar', length: 20, default: 'running' })
  status!: string;

  @Column({ type: 'jsonb', nullable: true, name: 'conclusion_json' })
  conclusionJson!: Record<string, any> | null;

  @Column({ type: 'text', nullable: true, name: 'conclusion_markdown' })
  conclusionMarkdown!: string | null;

  @Column({ type: 'jsonb', nullable: true, name: 'token_usage' })
  tokenUsage!: Record<string, any> | null;

  @Column({ type: 'varchar', length: 100, name: 'triggered_by' })
  triggeredBy!: string;

  @Column({ type: 'text', nullable: true, name: 'gm_remark' })
  gmRemark!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
