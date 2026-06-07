import { apiClient } from '@/shared/api/client';

export interface CharacterListItem {
  guid: number;
  name: string;
  accountId: number;
  accountUsername: string;
  race: number;
  class: number;
  gender: number;
  level: number;
  online: number;
  zone: number;
}

export interface CharacterBanRecord {
  banDate: Date;
  unbanDate: Date;
  bannedBy: string;
  banReason: string;
  active: number;
}

export interface CharacterDetail extends CharacterListItem {
  xp: number;
  money: number;
  map: number;
  positionX: number;
  positionY: number;
  positionZ: number;
  totalTime: number;
  arenaPoints: number;
  totalHonorPoints: number;
  totalKills: number;
  bans: CharacterBanRecord[];
}

export interface CharacterListResult {
  items: CharacterListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export const characterApi = {
  list: (params: { page?: number; pageSize?: number; search?: string; includeDeleted?: boolean }) =>
    apiClient.get<CharacterListResult>(
      `/api/characters?page=${params.page || 1}&pageSize=${params.pageSize || 20}${
        params.search ? `&search=${encodeURIComponent(params.search)}` : ''
      }${params.includeDeleted ? '&includeDeleted=true' : ''}`
    ),

  detail: (guid: number) => apiClient.get<CharacterDetail>(`/api/characters/${guid}`),

  unban: (guid: number) =>
    apiClient.post<{ success: boolean }>(`/api/characters/${guid}/unban`),

  ban: (guid: number, data: { duration: string; reason: string }) =>
    apiClient.post<{ success: boolean }>(`/api/characters/${guid}/ban`, data),

  mute: (guid: number, data: { duration: string; reason: string }) =>
    apiClient.post<{ success: boolean }>(`/api/characters/${guid}/mute`, data),

  unmute: (guid: number) =>
    apiClient.post<{ success: boolean }>(`/api/characters/${guid}/unmute`),
};
