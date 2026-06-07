import { apiClient } from '@/shared/api/client';

export const gmToolApi = {
  broadcast: (message: string) =>
    apiClient.post('/api/gm/broadcast', { message }),

  sendItems: (playerName: string, itemId: number, count?: number) =>
    apiClient.post('/api/gm/send-items', { playerName, itemId, count }),
};
