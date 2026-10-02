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

export interface RealmStatus {
  realmId: number;
  name: string;
  startTime: number;
  uptimeSeconds: number;
  maxPlayers: number;
  revision: string;
}

export interface LatestInspection {
  realm: string;
  reportDate: string;
  healthScore: number;
}

export interface MultiBoxCharacter {
  guid: number;
  name: string;
  level: number;
  race: number;
  class: number;
}

export interface MultiBoxAccount {
  accountId: number;
  username: string;
  characters: MultiBoxCharacter[];
}

export interface MultiBoxGroup {
  ip: string;
  accounts: MultiBoxAccount[];
}

export interface MultiBox {
  distinctPlayers: number;
  totalGroups: number;
  groups: MultiBoxGroup[];
}

export interface DashboardStats {
  onlinePlayers: number;
  newAccountsToday: number;
  activeAccountsToday: number;
  bansToday: number;
  realms: RealmStatus[];
  latestInspection: LatestInspection | null;
  /** 60s 缓存窗口内旧数据可能缺该字段，消费处全部 ?? 兜底 */
  multiBox?: MultiBox;
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

export interface HealthDetail {
  state: string;
  uptimeSeconds: number;
  dependencies: {
    authDb: boolean;
    charactersDb: boolean;
    worldDb: boolean;
    acmDb: boolean;
    redis: boolean;
  };
}

export interface TrendPoint {
  date: string;
  newAccounts: number;
  activeAccounts: number | null;
  peakOnline: number | null;
  bans: number;
}

export interface CumulativePoint {
  date: string;
  total: number;
}

export interface InspectionTrendPoint {
  date: string;
  realm: string;
  healthScore: number;
}

export interface DashboardTrends {
  days: number;
  series: TrendPoint[];
  cumulative: {
    baseline: number;
    points: CumulativePoint[];
  };
  inspections: InspectionTrendPoint[];
}

export const dashboardApi = {
  getStats: () => apiClient.get<DashboardStats>('/api/dashboard/stats'),
  getHealthDetail: () => apiClient.get<HealthDetail>('/api/health/detail'),
  getTrends: (days: number) => apiClient.get<DashboardTrends>(`/api/dashboard/trends?days=${days}`),
};
