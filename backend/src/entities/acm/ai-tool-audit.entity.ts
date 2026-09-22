import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'ai_tool_audit' })
@Index('idx_ai_tool_audit_ref', ['refId', 'id'])
export class AiToolAudit {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 64, name: 'ref_id' })
  refId!: string;

  @Column({ type: 'varchar', length: 100, name: 'tool_name' })
  toolName!: string;

  @Column({ type: 'jsonb', nullable: true, name: 'args_json' })
  argsJson!: Record<string, any> | null;

  @Column({ type: 'int', name: 'row_count', default: 0 })
  rowCount!: number;

  @Column({ type: 'int', name: 'duration_ms', default: 0 })
  durationMs!: number;

  @Column({ type: 'varchar', length: 20, default: 'ok' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
