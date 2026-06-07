import { apiClient } from '@/shared/api/client';

export const gmToolApi = {
  broadcast: (message: string) =>
    apiClient.post('/api/gm/broadcast', { message }),

  sendItems: (playerName: string, itemId: number, count?: number) =>
    apiClient.post('/api/gm/send-items', { playerName, itemId, count }),

  findPlayer: (name: string) =>
    apiClient.get<{ result: string }>(`/api/gm/find-player?name=${encodeURIComponent(name)}`),
};
