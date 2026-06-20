import { apiClient } from '@/shared/api/client';

export interface DistributionItem {
  key: number;
  count: number;
}

export interface FriendTopCharacter {
  guid: number;
  name: string;
  friendCount: number;
}

export interface DashboardStats {
  onlinePlayers: number;
  newAccountsToday: number;
  activeAccountsToday: number;
  population: {
    totalCharacters: number;
    levelDistribution: DistributionItem[];
    raceDistribution: DistributionItem[];
    classDistribution: DistributionItem[];
  };
  accountCharacters: {
    maxPerAccount: number;
    minPerAccount: number;
    accountsWithoutCharacters: number;
  };
  friends: {
    distribution: DistributionItem[];
    topCharacters: FriendTopCharacter[];
  };
}

export const dashboardApi = {
  getStats: () => apiClient.get<DashboardStats>('/api/dashboard/stats'),
};
