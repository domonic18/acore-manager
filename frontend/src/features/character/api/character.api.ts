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

export interface CharacterInventoryItem {
  itemGuid: number;
  bag: number;
  slot: number;
  itemEntry: number;
  count: number;
  displayId: number;
  containerSlots: number;
  quality: number;
  name: string;
  icon: string | null;
}

export interface ItemSearchResult {
  entry: number;
  name: string;
  description: string;
  displayId: number;
  quality: number;
  stackable: number;
  maxCount: number;
  icon: string | null;
}

export interface SendAdminMailPayload {
  subject: string;
  body: string;
  items: { entry: number; count: number }[];
  money: { gold: number; silver: number; copper: number };
}

export interface AdminMailReceipt {
  type: 'items' | 'money';
  ok: boolean;
  message: string;
}

export interface AdminMailHistoryItem {
  id: number;
  subject: string;
  body: string;
  money: number;
  hasItems: boolean;
  read: boolean;
  deliverTime: string;
  expireTime: string;
  items: { itemEntry: number; count: number; displayId: number; quality: number; name: string; icon: string | null }[];
}

export const characterApi = {
  list: (params: { page?: number; pageSize?: number; search?: string; includeDeleted?: boolean; online?: boolean }) =>
    apiClient.get<CharacterListResult>(
      `/api/characters?page=${params.page || 1}&pageSize=${params.pageSize || 20}${
        params.search ? `&search=${encodeURIComponent(params.search)}` : ''
      }${params.includeDeleted ? '&includeDeleted=true' : ''}${params.online ? '&online=true' : ''}`
    ),

  detail: (guid: number) => apiClient.get<CharacterDetail>(`/api/characters/${guid}`),

  inventory: (guid: number) => apiClient.get<CharacterInventoryItem[]>(`/api/characters/${guid}/inventory`),

  unban: (guid: number) =>
    apiClient.post<{ success: boolean }>(`/api/characters/${guid}/unban`),

  ban: (guid: number, data: { duration: string; reason: string }) =>
    apiClient.post<{ success: boolean }>(`/api/characters/${guid}/ban`, data),

  mute: (guid: number, data: { duration: string; reason: string }) =>
    apiClient.post<{ success: boolean }>(`/api/characters/${guid}/mute`, data),

  unmute: (guid: number) =>
    apiClient.post<{ success: boolean }>(`/api/characters/${guid}/unmute`),

  kick: (guid: number, data?: { reason?: string }) =>
    apiClient.post<{ ok: boolean; message: string }>(`/api/characters/${guid}/kick`, data),

  sendMessage: (guid: number, data: { message: string }) =>
    apiClient.post<{ ok: boolean; message: string; channel: 'chat' | 'mail' }>(`/api/characters/${guid}/message`, data),

  searchItems: (q: string, limit = 10) =>
    apiClient.get<ItemSearchResult[]>(
      `/api/items/search?q=${encodeURIComponent(q)}&limit=${limit}`
    ),

  sendMail: (guid: number, data: SendAdminMailPayload) =>
    apiClient.post<{ ok: boolean; receipts: AdminMailReceipt[] }>(`/api/characters/${guid}/mail`, data),

  adminMails: (guid: number) =>
    apiClient.get<AdminMailHistoryItem[]>(`/api/characters/${guid}/admin-mails`),
};
