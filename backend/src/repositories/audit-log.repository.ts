import { Between, FindOptionsWhere, ILike, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
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

  // 报告页"已警告"标注（T4.5）：按操作名 + 精确 target 集合查询，只取命中所需列
  async listByOperationAndTargets(operation: string, targets: string[]): Promise<OperationLog[]> {
    if (targets.length === 0) return [];
    return acmDataSource.getRepository(OperationLog).find({
      select: ['id', 'target'],
      where: { operation, target: In(targets) },
    });
  }

  // 邮件发送记录（GM 工具）：按操作名分页倒序；过滤词模糊匹配 target 列与 details JSON（角色名）
  async listByOperation(operation: string, offset: number, pageSize: number, filter?: string): Promise<{ items: OperationLog[]; total: number }> {
    const base: FindOptionsWhere<OperationLog> = { operation };
    const where = filter ? [{ ...base, target: ILike(`%${filter}%`) }, { ...base, details: ILike(`%${filter}%`) }] : base;
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
