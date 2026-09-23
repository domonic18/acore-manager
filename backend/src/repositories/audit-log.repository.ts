import { Between, FindOptionsWhere, ILike, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { acmDataSource } from '@/config/database';
import { OperationLog } from '@/entities/acm/operation-log.entity';

// GM 操作审计仓储（SELECT/INSERT）。2026-09-23 起表位于 acm（PostgreSQL），
// 此前在 acore_auth（MySQL），方言条件串已改为结构化过滤由本仓储统一翻译。

export interface AuditLogFilters {
  operatorId?: number;
  operation?: string;
  startDate?: string;
  endDate?: string;
}

class AuditLogRepository {
  async listLogs(
    offset: number,
    pageSize: number,
    filters: AuditLogFilters,
  ): Promise<{ items: OperationLog[]; total: number }> {
    const where: FindOptionsWhere<OperationLog> = {};
    if (filters.operatorId) where.operatorId = filters.operatorId;
    if (filters.operation) where.operation = ILike(`%${filters.operation}%`);
    // 与原 DATE(created_at) 语义对齐：start 取当日零点起，end 取当日末点止
    if (filters.startDate && filters.endDate) {
      where.createdAt = Between(new Date(`${filters.startDate}T00:00:00`), new Date(`${filters.endDate}T23:59:59.999`));
    } else if (filters.startDate) {
      where.createdAt = MoreThanOrEqual(new Date(`${filters.startDate}T00:00:00`));
    } else if (filters.endDate) {
      where.createdAt = LessThanOrEqual(new Date(`${filters.endDate}T23:59:59.999`));
    }

    const [items, total] = await acmDataSource
      .getRepository(OperationLog)
      .findAndCount({ where, order: { createdAt: 'DESC' }, skip: offset, take: pageSize });

    return { items, total };
  }

  async record(log: {
    operatorId: number;
    operatorName: string;
    operation: string;
    target: string;
    details: string | null;
  }): Promise<void> {
    const repo = acmDataSource.getRepository(OperationLog);
    await repo.insert(
      repo.create({
        operatorId: log.operatorId,
        operatorName: log.operatorName,
        operation: log.operation,
        target: log.target,
        details: log.details,
      }),
    );
  }
}

export const auditLogRepository = new AuditLogRepository();
