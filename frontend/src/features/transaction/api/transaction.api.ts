import { apiClient } from '@/shared/api/client';

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

export const transactionApi = {
  list: (params: {
    page?: number;
    pageSize?: number;
    characterName?: string;
    targetName?: string;
    type?: number;
    minAmount?: number;
    maxAmount?: number;
    startDate?: string;
    endDate?: string;
  }) => apiClient.get<TransactionListResult>(
    `/api/transactions?page=${params.page || 1}&pageSize=${params.pageSize || 20}` +
    `${params.characterName ? `&characterName=${encodeURIComponent(params.characterName)}` : ''}` +
    `${params.targetName ? `&targetName=${encodeURIComponent(params.targetName)}` : ''}` +
    `${params.type !== undefined ? `&type=${params.type}` : ''}` +
    `${params.minAmount !== undefined ? `&minAmount=${params.minAmount}` : ''}` +
    `${params.maxAmount !== undefined ? `&maxAmount=${params.maxAmount}` : ''}` +
    `${params.startDate ? `&startDate=${params.startDate}` : ''}` +
    `${params.endDate ? `&endDate=${params.endDate}` : ''}`,
  ),
};
