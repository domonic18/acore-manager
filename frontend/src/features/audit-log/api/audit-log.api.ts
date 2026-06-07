import { apiClient } from '@/shared/api/client';

export interface OperationLog {
  id: number;
  operatorId: number;
  operatorName: string;
  operation: string;
  target: string;
  details: string;
  createdAt: Date;
}

export interface AuditLogListResult {
  items: OperationLog[];
  total: number;
  page: number;
  pageSize: number;
}

export const auditLogApi = {
  list: (params: {
    page?: number;
    pageSize?: number;
    operatorId?: number;
    operation?: string;
    startDate?: string;
    endDate?: string;
  }) => apiClient.get<AuditLogListResult>(
    `/api/audit?page=${params.page || 1}&pageSize=${params.pageSize || 20}` +
    `${params.operatorId ? `&operatorId=${params.operatorId}` : ''}` +
    `${params.operation ? `&operation=${encodeURIComponent(params.operation)}` : ''}` +
    `${params.startDate ? `&startDate=${params.startDate}` : ''}` +
    `${params.endDate ? `&endDate=${params.endDate}` : ''}`,
  ),
};
