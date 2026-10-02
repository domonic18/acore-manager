import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export const PATROL_FINDING_TYPES = ['bg_honor_farm', 'hardcore_carry'] as const;
export type PatrolFindingType = (typeof PATROL_FINDING_TYPES)[number];

export const PATROL_FINDING_STATUSES = ['open', 'actioned', 'dismissed'] as const;
export type PatrolFindingStatus = (typeof PATROL_FINDING_STATUSES)[number];

export interface PatrolFindingSubject {
  accountId: number;
  accountName: string;
  characterGuid: number;
  characterName: string;
  level: number;
  hardcore: boolean;
  ip: string;
  extra?: Record<string, any>;
}

@Entity({ name: 'patrol_findings' })
@Index('idx_patrol_findings_detected_at', ['detectedAt'])
@Index('idx_patrol_findings_type_status', ['findingType', 'status'])
export class PatrolFinding {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 32, name: 'finding_type' })
  findingType!: PatrolFindingType;

  @Column({ type: 'varchar', length: 32 })
  realm!: string;

  @Column({ type: 'timestamp', name: 'detected_at' })
  detectedAt!: Date;

  @Column({ type: 'int', name: 'occurrence_count', default: 1 })
  occurrenceCount!: number;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: PatrolFindingStatus;

  @Column({ type: 'varchar', length: 160, name: 'dedupe_key', unique: true })
  dedupeKey!: string;

  @Column({ type: 'jsonb', name: 'subjects_json' })
  subjectsJson!: PatrolFindingSubject[];

  @Column({ type: 'jsonb', name: 'evidence_json' })
  evidenceJson!: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
