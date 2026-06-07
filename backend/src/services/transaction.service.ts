import { cacheService } from './cache.service';
import { transactionRepository } from '../repositories/transaction.repository';

export interface TransactionRecord {
  senderName: string;
  receiverName: string;
  amount: number;
  date: Date;
  type: number;
  typeLabel: string;
  senderLevel: number | null;
  senderRace: number | null;
  senderFaction: 'alliance' | 'horde' | null;
  receiverLevel: number | null;
  receiverRace: number | null;
  receiverFaction: 'alliance' | 'horde' | null;
}

export interface TransactionListResult {
  items: TransactionRecord[];
  total: number;
  page: number;
  pageSize: number;
}

const TransactionTypeLabels: Record<number, string> = {
  1: '货到付款',
  2: '拍卖行',
  3: '公会银行存款',
  4: '公会银行取款',
  5: '邮寄',
  6: '交易',
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

    const { items, total } = await transactionRepository.listTransactions(offset, pageSize, conditions, params);

    const getFaction = (race: number | null): 'alliance' | 'horde' | null => {
      if (race === null) return null;
      // Alliance: Human(1), Dwarf(3), Night Elf(4), Gnome(7), Draenei(11)
      if ([1, 3, 4, 7, 11].includes(race)) return 'alliance';
      // Horde: Orc(2), Undead(5), Tauren(6), Troll(8), Blood Elf(10)
      if ([2, 5, 6, 8, 10].includes(race)) return 'horde';
      return null;
    };

    const result: TransactionListResult = {
      items: items.map((item: any) => ({
        senderName: item.senderName,
        receiverName: item.receiverName,
        amount: item.amount,
        date: item.date,
        type: item.type,
        typeLabel: TransactionTypeLabels[item.type] || `类型${item.type}`,
        senderLevel: item.senderLevel ?? null,
        senderRace: item.senderRace ?? null,
        senderFaction: getFaction(item.senderRace ?? null),
        receiverLevel: item.receiverLevel ?? null,
        receiverRace: item.receiverRace ?? null,
        receiverFaction: getFaction(item.receiverRace ?? null),
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
