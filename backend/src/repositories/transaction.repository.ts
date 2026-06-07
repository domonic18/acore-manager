import { charactersDataSource } from '../config/database';

class TransactionRepository {
  async listTransactions(
    offset: number,
    pageSize: number,
    conditions: string[],
    params: any[],
  ): Promise<{ items: any[]; total: number }> {
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await charactersDataSource.query(
      `SELECT COUNT(*) as total FROM log_money ${whereClause}`,
      params,
    );
    const total = parseInt(countResult[0]?.total || '0', 10);

    const items = await charactersDataSource.query(
      `SELECT
        lm.sender_name as senderName,
        lm.receiver_name as receiverName,
        lm.money as amount,
        lm.date,
        lm.type,
        s.level as senderLevel,
        s.race as senderRace,
        r.level as receiverLevel,
        r.race as receiverRace
      FROM log_money lm
      LEFT JOIN characters s ON s.name = lm.sender_name AND s.name != ''
      LEFT JOIN characters r ON r.name = lm.receiver_name AND r.name != ''
      ${whereClause}
      ORDER BY lm.date DESC
      LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    return { items, total };
  }
}

export const transactionRepository = new TransactionRepository();
