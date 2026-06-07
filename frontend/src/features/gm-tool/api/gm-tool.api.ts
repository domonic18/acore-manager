import { apiClient } from '@/shared/api/client';

export const gmToolApi = {
  broadcast: (message: string) =>
    apiClient.post('/api/gm/broadcast', { message }),
};
