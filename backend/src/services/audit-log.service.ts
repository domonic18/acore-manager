import { auditLogRepository } from '@/repositories/audit-log.repository';

export interface OperationLog {
  id: number;
  operatorId: number;
  operatorName: string;
  operation: string;
  target: string;
  details: string | null;
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

    try {
      const { items, total } = await auditLogRepository.listLogs(offset, pageSize, {
        operatorId: filters?.operatorId,
        operation: filters?.operation,
        startDate: filters?.startDate,
        endDate: filters?.endDate,
      });

      return {
        items: items.map((item) => ({
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
