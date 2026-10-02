import { cacheService } from './cache.service';
import { logger } from '@/middleware/request-logger';
import {
  dashboardRepository,
  type DistributionItem,
  type RealmStatus,
  type LatestInspection,
  type OnlineAccountIpRow,
} from '@/repositories/dashboard.repository';

export interface FriendTopCharacter {
  guid: number;
  name: string;
  friendCount: number;
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

const MULTI_BOX_GROUP_CAP = 50;

// last_ip 是"最近登录 IP"而非严格当前会话 IP；loopback/空 IP 无法用于去重，按每账号 1 人计
function buildMultiBox(rows: OnlineAccountIpRow[]): MultiBox {
  const LOOPBACK = new Set(['127.0.0.1', '::1']);

  const distinctIps = new Set<string>();
  const loopbackAccounts = new Set<number>();

  const byIp = new Map<string, Map<number, MultiBoxAccount>>();
  for (const row of rows) {
    if (!row.ip || LOOPBACK.has(row.ip)) {
      loopbackAccounts.add(row.accountId);
      continue;
    }
    distinctIps.add(row.ip);
    const accounts = byIp.get(row.ip) ?? new Map<number, MultiBoxAccount>();
    const account = accounts.get(row.accountId) ?? {
      accountId: row.accountId,
      username: row.username,
      characters: [],
    };
    account.characters.push({
      guid: row.guid,
      name: row.name,
      level: row.level,
      race: row.race,
      class: row.class,
    });
    accounts.set(row.accountId, account);
    byIp.set(row.ip, accounts);
  }

  const groups: MultiBoxGroup[] = [];
  for (const [ip, accounts] of byIp) {
    if (accounts.size < 2) continue;
    const list = [...accounts.values()];
    groups.push({ ip, accounts: list });
  }
  groups.sort((a, b) => b.accounts.length - a.accounts.length);

  return {
    distinctPlayers: distinctIps.size + loopbackAccounts.size,
    totalGroups: groups.length,
    groups: groups.slice(0, MULTI_BOX_GROUP_CAP),
  };
}

export interface DashboardStats {
  onlinePlayers: number;
  newAccountsToday: number;
  activeAccountsToday: number;
  bansToday: number;
  realms: RealmStatus[];
  latestInspection: LatestInspection | null;
  multiBox: MultiBox;
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

export class DashboardService {
  async getStats(): Promise<DashboardStats> {
    const cacheKey = 'dashboard:stats';
    const cached = await cacheService.get<DashboardStats>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const onlinePlayers = await dashboardRepository.getOnlinePlayersCount();

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().slice(0, 10);

      const newAccountsToday = await dashboardRepository.getNewAccountsToday(todayStr);
      const activeAccountsToday = await dashboardRepository.getActiveAccountsToday(todayStr);

      const [levelDistribution, raceDistribution, classDistribution] = await Promise.all([
        dashboardRepository.getLevelDistribution(),
        dashboardRepository.getRaceDistribution(),
        dashboardRepository.getClassDistribution(),
      ]);

      const totalCharacters = levelDistribution.reduce((sum, item) => sum + item.count, 0);

      const [maxPerAccount, minPerAccount, accountsWithoutCharacters] = await Promise.all([
        dashboardRepository.getMaxCharactersPerAccount(),
        dashboardRepository.getMinCharactersPerAccount(),
        dashboardRepository.getAccountsWithoutCharacters(),
      ]);

      const [friendDistribution, topCharactersByFriends] = await Promise.all([
        dashboardRepository.getFriendDistribution(),
        dashboardRepository.getTopCharactersByFriends(5),
      ]);

      // 治理信号与 realm 状态：封禁按本地 0 点 epoch 区间统计，巡检取最新有效报告
      const todayEpoch = Math.floor(today.getTime() / 1000);
      const [realms, bansToday, latestInspection, onlineAccountIps] = await Promise.all([
        dashboardRepository.getRealmStatuses(),
        dashboardRepository.getBansToday(todayEpoch, todayEpoch + 86400),
        dashboardRepository.getLatestInspection(),
        dashboardRepository.getOnlineAccountIps(),
      ]);
      const multiBox = buildMultiBox(onlineAccountIps);

      const stats: DashboardStats = {
        onlinePlayers,
        newAccountsToday,
        activeAccountsToday,
        bansToday,
        realms,
        latestInspection,
        multiBox,
        population: {
          totalCharacters,
          levelDistribution,
          raceDistribution,
          classDistribution,
        },
        accountCharacters: {
          maxPerAccount,
          minPerAccount,
          accountsWithoutCharacters,
        },
        friends: {
          distribution: friendDistribution,
          topCharacters: topCharactersByFriends,
        },
      };

      await cacheService.set(cacheKey, stats, 60);
      return stats;
    } catch (error) {
      logger.error({ error }, 'Failed to get dashboard stats');
      return {
        onlinePlayers: 0,
        newAccountsToday: 0,
        activeAccountsToday: 0,
        bansToday: 0,
        realms: [],
        latestInspection: null,
        multiBox: { distinctPlayers: 0, totalGroups: 0, groups: [] },
        population: {
          totalCharacters: 0,
          levelDistribution: [],
          raceDistribution: [],
          classDistribution: [],
        },
        accountCharacters: {
          maxPerAccount: 0,
          minPerAccount: 0,
          accountsWithoutCharacters: 0,
        },
        friends: {
          distribution: [],
          topCharacters: [],
        },
      };
    }
  }
}

export const dashboardService = new DashboardService();
