import { apiClient } from '@/shared/api/client';

export interface DashboardStats {
  onlinePlayers: number;
  newAccountsToday: number;
  activeAccountsToday: number;
}

export const dashboardApi = {
  getStats: () => apiClient.get<DashboardStats>('/api/dashboard/stats'),
};
