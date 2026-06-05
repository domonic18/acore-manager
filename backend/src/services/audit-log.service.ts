import { authDataSource } from '../config/database';

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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await authDataSource.query(
      `SELECT COUNT(*) as total FROM acm_operation_logs ${whereClause}`,
      params,
    );
    const total = parseInt(countResult[0]?.total || '0', 10);

    const items = await authDataSource.query(
      `SELECT
        id,
        operator_id as operatorId,
        operator_name as operatorName,
        operation,
        target,
        details,
        created_at as createdAt
      FROM acm_operation_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

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
  }

  async record(log: Omit<OperationLog, 'id' | 'createdAt'>): Promise<void> {
    try {
      await authDataSource.query(
        `INSERT INTO acm_operation_logs
         (operator_id, operator_name, operation, target, details, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [log.operatorId, log.operatorName, log.operation, log.target, log.details],
      );
    } catch {
      // 审计日志失败不影响主流程
    }
  }
}

export const auditLogService = new AuditLogService();
