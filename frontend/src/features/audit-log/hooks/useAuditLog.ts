import { useQuery } from '@tanstack/react-query';
import { auditLogApi } from '../api/audit-log.api';

export function useAuditLogList(params: {
  page?: number;
  pageSize?: number;
  operatorId?: number;
  operation?: string;
  startDate?: string;
  endDate?: string;
}) {
  return useQuery({
    queryKey: ['audit', 'list', params],
    queryFn: () => auditLogApi.list(params),
  });
}
