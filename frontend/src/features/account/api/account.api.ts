import { apiClient } from '@/shared/api/client';

export interface AccountListItem {
  id: number;
  username: string;
  email: string;
  gmlevel: number;
  online: number;
  lastLogin: Date | null;
  lastIp: string;
  locked: number;
  characterCount: number;
}

export interface BanRecord {
  banDate: Date;
  unbanDate: Date;
  bannedBy: string;
  banReason: string;
  active: number;
}

export interface AccountCharacter {
  guid: number;
  name: string;
  level: number;
  race: number;
  class: number;
  gender: number;
  online: number;
  zone: number;
}

export interface AccountDetail extends AccountListItem {
  joinDate: Date;
  failedLogins: number;
  muteTime: number;
  muteReason: string;
  totalTime: number;
  bans: BanRecord[];
}

export interface AccountListResult {
  items: AccountListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export const accountApi = {
  list: (params: { page?: number; pageSize?: number; search?: string }) =>
    apiClient.get<AccountListResult>(`/api/accounts?page=${params.page || 1}&pageSize=${params.pageSize || 20}${params.search ? `&search=${encodeURIComponent(params.search)}` : ''}`),

  detail: (id: number) =>
    apiClient.get<AccountDetail>(`/api/accounts/${id}`),

  characters: (id: number) =>
    apiClient.get<AccountCharacter[]>(`/api/accounts/${id}/characters`),

  unban: (id: number) =>
    apiClient.post<{ success: boolean }>(`/api/accounts/${id}/unban`),

  ban: (id: number, data: { duration: string; reason: string }) =>
    apiClient.post<{ success: boolean }>(`/api/accounts/${id}/ban`, data),

  loginHistory: (id: number) =>
    apiClient.get<{ items: Array<{ ip: string; time: Date; action: string; comment?: string }> }>(`/api/accounts/${id}/login-history`),
};
