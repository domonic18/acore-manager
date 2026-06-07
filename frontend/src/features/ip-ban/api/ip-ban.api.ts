import { apiClient } from '@/shared/api/client';

export interface IpBanRecord {
  ip: string;
  banDate: Date;
  unbanDate: Date;
  bannedBy: string;
  banReason: string;
}

export interface IpBanListResult {
  items: IpBanRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export const ipBanApi = {
  list: (params: { page?: number; pageSize?: number; search?: string }) =>
    apiClient.get<IpBanListResult>(`/api/ip-bans?page=${params.page || 1}&pageSize=${params.pageSize || 20}${params.search ? `&search=${encodeURIComponent(params.search)}` : ''}`),

  ban: (data: { ip: string; duration: string; reason: string }) =>
    apiClient.post<{ success: boolean }>('/api/ip-bans', data),

  unban: (ip: string) =>
    apiClient.del<{ success: boolean }>(`/api/ip-bans/${ip}`),
};
