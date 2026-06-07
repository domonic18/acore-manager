import { apiClient } from '@/shared/api/client';

export interface MuteRecord {
  accountId: number;
  username: string;
  lastIp: string;
  characterNames: string;
  muteTime: string;
  muteReason: string;
  mutedBy: string;
}

export const muteApi = {
  list: () => apiClient.get<MuteRecord[]>('/api/mutes'),
};
