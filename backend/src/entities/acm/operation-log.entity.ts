import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// ACM 操作审计日志（docs/standard/数据库操作规范.md 例外表，acm_ 前缀与 AzerothCore 核心表区分）。
// 原位于 acore_auth（MySQL），2026-09-23 迁入 acm（PostgreSQL）与系统自有库统一。
// 各 GM 写操作（封禁/白名单/报告删除/RBAC 等）经 auditLogService.record 落入本表。

@Entity({ name: 'acm_operation_logs' })
@Index('idx_acm_operation_logs_operation', ['operation'])
@Index('idx_acm_operation_logs_created', ['createdAt'])
export class OperationLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'operator_id', type: 'int', default: 0 })
  operatorId!: number;

  @Column({ name: 'operator_name', type: 'varchar', length: 64, default: '' })
  operatorName!: string;

  @Column({ type: 'varchar', length: 64 })
  operation!: string;

  @Column({ type: 'varchar', length: 128, default: '' })
  target!: string;

  @Column({ type: 'text', nullable: true })
  details!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
