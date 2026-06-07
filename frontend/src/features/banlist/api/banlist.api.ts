import { apiClient } from '@/shared/api/client';

export interface BanlistItem {
  accountId: number;
  username: string;
  lastIp: string;
  banDate: string;
  unbanDate: string;
  banReason: string;
  bannedBy: string;
  characterNames: string;
  banType: 'account' | 'character';
}

export const banlistApi = {
  list: () => apiClient.get<BanlistItem[]>('/api/banlist'),
};
