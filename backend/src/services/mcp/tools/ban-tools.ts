import { banlistRepository } from '@/repositories/banlist.repository';
import { accountRepository } from '@/repositories/account.repository';
import type {
  AccountSummary,
  BanHistoryItem,
  BanItem,
  BanType,
  CharacterSummary,
  CheckAccountBannedResult,
  ListBansInput,
  ListBansResult,
} from '../types';

// 封号相关 MCP 工具的纯业务实现（供 server.ts 注册，便于单测直接调用）

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** AC 的 bandate/unbandate 是 unix 秒级时间戳 */
export function unixToIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

/**
 * 解禁时间：AC 的永久封禁记录 unbandate == bandate（实测本地库 76/76 条生效封禁均如此），
 * unbandate <= bandate 视为永久封禁 → null，避免把封禁时刻误读成解禁时刻。
 */
export function unbanDateOf(row: { banDate?: unknown; unbanDate?: unknown }): string | null {
  const unban = Number(row.unbanDate);
  const ban = Number(row.banDate);
  if (!Number.isFinite(unban) || unban <= 0) return null;
  if (Number.isFinite(ban) && unban <= ban) return null;
  return new Date(unban * 1000).toISOString();
}

function toBanItem(row: any): BanItem {
  return {
    accountId: row.accountId ?? null,
    username: row.username ?? null,
    characterNames: row.characterNames ?? null,
    banType: (row.banType ?? 'account') as BanType,
    banDate: unixToIso(row.banDate),
    banReason: row.banReason ?? null,
    bannedBy: row.bannedBy ?? null,
    unbanDate: unbanDateOf(row),
    lastIp: row.lastIp ?? null,
  };
}

export async function listBans(input: ListBansInput = {}): Promise<ListBansResult> {
  const page = Math.max(1, Math.floor(Number(input.page) || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(input.pageSize) || DEFAULT_PAGE_SIZE)));
  const filters = {
    username: input.username?.trim() || undefined,
    characterName: input.characterName?.trim() || undefined,
    banType: input.banType,
  };
  const [rows, total] = await Promise.all([
    banlistRepository.listActiveBansFiltered(filters, pageSize, (page - 1) * pageSize),
    banlistRepository.countActiveBansFiltered(filters),
  ]);
  return { total, page, pageSize, items: (rows ?? []).map(toBanItem) };
}

export async function checkAccountBanned(username: string): Promise<CheckAccountBannedResult> {
  const name = String(username ?? '').trim();
  const account = name ? await accountRepository.findByUsernameCaseInsensitive(name) : null;
  if (!account) {
    return {
      found: false,
      username: name,
      account: null,
      banned: false,
      activeBans: [],
      banHistory: [],
      characters: [],
    };
  }

  const [banRows, historyRows, characterRows] = await Promise.all([
    banlistRepository.listActiveBansByAccount(account.id),
    accountRepository.getBanRecords(account.id),
    accountRepository.getAccountCharacters(account.id),
  ]);

  const activeBans = (banRows ?? []).map(toBanItem);
  const accountSummary: AccountSummary = {
    id: account.id,
    username: account.username,
    email: account.email ?? null,
    lastIp: account.lastIp ?? null,
    lastLogin: account.lastLogin ? new Date(account.lastLogin).toISOString() : null,
    joinDate: account.joinDate ? new Date(account.joinDate).toISOString() : null,
    gmlevel: Number(account.gmlevel ?? 0),
  };
  const banHistory: BanHistoryItem[] = (historyRows ?? []).map((row: any) => ({
    banDate: unixToIso(row.banDate),
    unbanDate: unbanDateOf(row),
    bannedBy: row.bannedBy ?? null,
    banReason: row.banReason ?? null,
    active: row.active,
  }));
  const characters: CharacterSummary[] = (characterRows ?? []).map((row: any) => ({
    guid: row.guid,
    name: row.name,
    level: row.level,
    online: row.online,
  }));

  return {
    found: true,
    username: account.username,
    account: accountSummary,
    banned: activeBans.length > 0,
    activeBans,
    banHistory,
    characters,
  };
}

/** 该账号最新的生效封禁时间（申诉场景的时间窗推导用） */
export async function findLatestBanDate(accountId: number): Promise<{ banDate: Date; banReason: string | null; bannedBy: string | null } | null> {
  const rows = await banlistRepository.listActiveBansByAccount(accountId);
  let latest: { banDate: Date; banReason: string | null; bannedBy: string | null } | null = null;
  for (const row of rows ?? []) {
    const seconds = Number(row.banDate);
    if (!Number.isFinite(seconds) || seconds <= 0) continue;
    const banDate = new Date(seconds * 1000);
    if (!latest || banDate > latest.banDate) {
      latest = { banDate, banReason: row.banReason ?? null, bannedBy: row.bannedBy ?? null };
    }
  }
  return latest;
}
