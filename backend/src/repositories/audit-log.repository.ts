import { authDataSource } from '../config/database';

class AuditLogRepository {
  async listLogs(
    offset: number,
    pageSize: number,
    conditions: string[],
    params: any[],
  ): Promise<{ items: any[]; total: number }> {
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

    return { items, total };
  }

  async record(log: {
    operatorId: number;
    operatorName: string;
    operation: string;
    target: string;
    details: string;
  }): Promise<void> {
    await authDataSource.query(
      `INSERT INTO acm_operation_logs
       (operator_id, operator_name, operation, target, details, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [log.operatorId, log.operatorName, log.operation, log.target, log.details],
    );
  }
}

export const auditLogRepository = new AuditLogRepository();
