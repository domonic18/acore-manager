import { charactersDataSource } from '../config/database';
import { cacheService } from './cache.service';

export interface TransactionRecord {
  senderName: string;
  receiverName: string;
  amount: number;
  date: Date;
  type: number;
  typeLabel: string;
}

export interface TransactionListResult {
  items: TransactionRecord[];
  total: number;
  page: number;
  pageSize: number;
}

const TransactionTypeLabels: Record<number, string> = {
  1: '邮寄',
  2: '交易',
  3: 'COD',
  4: '拍卖行',
  5: '公会银行',
};

export class TransactionService {
  async listTransactions(
    page: number = 1,
    pageSize: number = 20,
    filters?: {
      characterName?: string;
      targetName?: string;
      type?: number;
      minAmount?: number;
      maxAmount?: number;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<TransactionListResult> {
    const cacheKey = `transactions:list:${page}:${pageSize}:${JSON.stringify(filters || {})}`;
    const cached = await cacheService.get<TransactionListResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const offset = (page - 1) * pageSize;
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters?.characterName) {
      conditions.push('(sender_name = ? OR receiver_name = ?)');
      params.push(filters.characterName, filters.characterName);
    }

    if (filters?.targetName) {
      conditions.push('(sender_name = ? OR receiver_name = ?)');
      params.push(filters.targetName, filters.targetName);
    }

    if (filters?.type !== undefined) {
      conditions.push('type = ?');
      params.push(filters.type);
    }

    if (filters?.minAmount !== undefined) {
      conditions.push('amount >= ?');
      params.push(filters.minAmount);
    }

    if (filters?.maxAmount !== undefined) {
      conditions.push('amount <= ?');
      params.push(filters.maxAmount);
    }

    if (filters?.startDate) {
      conditions.push('DATE(date) >= ?');
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      conditions.push('DATE(date) <= ?');
      params.push(filters.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await charactersDataSource.query(
      `SELECT COUNT(*) as total FROM log_money ${whereClause}`,
      params,
    );
    const total = parseInt(countResult[0]?.total || '0', 10);

    const items = await charactersDataSource.query(
      `SELECT
        sender_name as senderName,
        receiver_name as receiverName,
        amount,
        date,
        type
      FROM log_money
      ${whereClause}
      ORDER BY date DESC
      LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    const result: TransactionListResult = {
      items: items.map((item: any) => ({
        senderName: item.senderName,
        receiverName: item.receiverName,
        amount: item.amount,
        date: item.date,
        type: item.type,
        typeLabel: TransactionTypeLabels[item.type] || `类型${item.type}`,
      })),
      total,
      page,
      pageSize,
    };

    await cacheService.set(cacheKey, result, 120);
    return result;
  }
}

export const transactionService = new TransactionService();
