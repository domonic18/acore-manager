import { auditLogRepository } from '../repositories/audit-log.repository';

export interface OperationLog {
  id: number;
  operatorId: number;
  operatorName: string;
  operation: string;
  target: string;
  details: string;
  createdAt: Date;
}

export class AuditLogService {
  async listLogs(
    page: number = 1,
    pageSize: number = 20,
    filters?: {
      operatorId?: number;
      operation?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<{ items: OperationLog[]; total: number; page: number; pageSize: number }> {
    const offset = (page - 1) * pageSize;
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters?.operatorId) {
      conditions.push('operator_id = ?');
      params.push(filters.operatorId);
    }

    if (filters?.operation) {
      conditions.push('operation LIKE ?');
      params.push(`%${filters.operation}%`);
    }

    if (filters?.startDate) {
      conditions.push('DATE(created_at) >= ?');
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      conditions.push('DATE(created_at) <= ?');
      params.push(filters.endDate);
    }

    try {
      const { items, total } = await auditLogRepository.listLogs(offset, pageSize, conditions, params);

      return {
        items: items.map((item: any) => ({
          id: item.id,
          operatorId: item.operatorId,
          operatorName: item.operatorName,
          operation: item.operation,
          target: item.target,
          details: item.details,
          createdAt: item.createdAt,
        })),
        total,
        page,
        pageSize,
      };
    } catch {
      return { items: [], total: 0, page, pageSize };
    }
  }

  async record(log: Omit<OperationLog, 'id' | 'createdAt'>): Promise<void> {
    try {
      await auditLogRepository.record(log);
    } catch {
      // 审计日志失败不影响主流程
    }
  }
}

export const auditLogService = new AuditLogService();
