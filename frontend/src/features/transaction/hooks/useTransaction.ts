import { useQuery } from '@tanstack/react-query';
import { transactionApi } from '../api/transaction.api';

export function useTransactionList(params: {
  page?: number;
  pageSize?: number;
  characterName?: string;
  targetName?: string;
  type?: number;
  minAmount?: number;
  maxAmount?: number;
  startDate?: string;
  endDate?: string;
}) {
  return useQuery({
    queryKey: ['transactions', 'list', params],
    queryFn: () => transactionApi.list(params),
  });
}
