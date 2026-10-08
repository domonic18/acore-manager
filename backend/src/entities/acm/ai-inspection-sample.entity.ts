import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** 巡查样本库（acm.ai_inspection_sample）：生产确认的作弊/误报标注语料，用于回归评测与提示词校准 */
@Entity({ name: 'ai_inspection_sample' })
export class AiInspectionSample {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 32 })
  realm!: string;

  @Column({ type: 'int', nullable: true, name: 'character_guid' })
  characterGuid!: number | null;

  @Column({ type: 'varchar', length: 100, name: 'character_name' })
  characterName!: string;

  @Column({ type: 'varchar', length: 16 })
  label!: 'cheat' | 'false_positive' | 'pending';

  @Column({ type: 'varchar', length: 32 })
  source!: 'auto_ban' | 'appeal' | 'deep_analysis' | 'inspection' | 'gm';

  @Column({ type: 'date', nullable: true, name: 'detected_date' })
  detectedDate!: string | null;

  @Column({ type: 'varchar', length: 1000 })
  summary!: string;

  @Column({ type: 'jsonb', name: 'evidence_json' })
  evidenceJson!: { source: string; quote: string }[];

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'ref_url' })
  refUrl!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'created_by' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
