import { readDefaultRealm } from '@/config/system-config.reader';
import { accountRepository } from '@/repositories/account.repository';
import { targetedAnalysisService } from '@/services/ai/targeted-analysis.service';
import type {
  AnalysisStatus,
  AnalysisSubjectType,
  CreateTargetedAnalysisInput,
  CreateTargetedAnalysisResult,
  GetTargetedAnalysisResult,
  ListTargetedAnalysesInput,
  ListTargetedAnalysesResult,
  TimeWindowSource,
} from '../types';
import { findLatestBanDate } from './ban-tools';

// 深度分析相关 MCP 工具（账号申诉闭环的第 4/5/6 步）

/** 与 targeted-analysis.service 的日期边界一致：时间窗按 UTC+8 的自然日切分 */
const TZ_OFFSET_MS = 8 * 3600 * 1000;
const DEFAULT_WINDOW_DAYS = 7;
const MAX_WINDOW_DAYS = 31;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function toDateOnly(date: Date): string {
  const shifted = new Date(date.getTime() + TZ_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shiftDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 3600 * 1000);
}

/** 解析分析对象 → 账号 id（角色名先按角色反查，查不到再按账号名回退） */
async function resolveAccountId(subjectName: string, subjectType: AnalysisSubjectType): Promise<number | null> {
  if (subjectType === 'character') {
    const byCharacter = await accountRepository.findAccountIdByCharacterName(subjectName);
    if (byCharacter) return byCharacter;
  }
  const account = await accountRepository.findByUsernameCaseInsensitive(subjectName);
  return account?.id ?? null;
}

export interface ResolvedTimeWindow {
  timeFrom: string;
  timeTo: string;
  source: TimeWindowSource;
  banContext: { date?: string; reason?: string; bannedBy?: string } | null;
}

/**
 * 时间窗解析（申诉场景默认以封禁时间为准）：
 * 1. agent 显式给了 timeFrom+timeTo → explicit
 * 2. 找到对象的生效封禁时间 → 封禁日−7d ~ 封禁日（ban-date）
 * 3. 都取不到 → 最近 7 天（default-7d）
 * 跨度一律钳制 ≤ 31 天（与后端既有的时间范围约束一致）。
 */
export async function resolveTimeWindow(
  input: CreateTargetedAnalysisInput,
  subjectType: AnalysisSubjectType,
): Promise<ResolvedTimeWindow> {
  const explicitFrom = input.timeFrom ? parseDateOnly(input.timeFrom) : null;
  const explicitTo = input.timeTo ? parseDateOnly(input.timeTo) : null;

  let from: Date;
  let to: Date;
  let source: TimeWindowSource;
  let derivedBanContext: { date?: string; reason?: string; bannedBy?: string } | null = null;

  if (explicitFrom && explicitTo) {
    from = explicitFrom;
    to = explicitTo;
    source = 'explicit';
  } else {
    let latestBan: { banDate: Date; banReason: string | null; bannedBy: string | null } | null = null;
    for (const subjectName of input.subjectNames) {
      const name = String(subjectName ?? '').trim();
      if (!name) continue;
      const accountId = await resolveAccountId(name, subjectType);
      if (!accountId) continue;
      const ban = await findLatestBanDate(accountId);
      if (ban && (!latestBan || ban.banDate > latestBan.banDate)) latestBan = ban;
    }
    if (latestBan) {
      to = latestBan.banDate;
      from = shiftDays(to, -DEFAULT_WINDOW_DAYS);
      source = 'ban-date';
      derivedBanContext = {
        date: toDateOnly(latestBan.banDate),
        reason: latestBan.banReason || undefined,
        bannedBy: latestBan.bannedBy || undefined,
      };
    } else {
      to = new Date();
      from = shiftDays(to, -DEFAULT_WINDOW_DAYS);
      source = 'default-7d';
    }
  }

  if (to < from) {
    const swapped = from;
    from = to;
    to = swapped;
  }
  const spanDays = Math.round((to.getTime() - from.getTime()) / (24 * 3600 * 1000));
  if (spanDays > MAX_WINDOW_DAYS) from = shiftDays(to, -MAX_WINDOW_DAYS);

  return {
    timeFrom: toDateOnly(from),
    timeTo: toDateOnly(to),
    source,
    banContext: derivedBanContext,
  };
}

export async function createTargetedAnalysis(input: CreateTargetedAnalysisInput): Promise<CreateTargetedAnalysisResult> {
  const subjectType: AnalysisSubjectType = input.subjectType === 'account' ? 'account' : 'character';
  const subjectNames = [...new Set((input.subjectNames ?? []).map((n) => String(n ?? '').trim()).filter(Boolean))];
  if (subjectNames.length === 0) throw new Error('subjectNames 不能为空');

  const window = await resolveTimeWindow({ ...input, subjectNames }, subjectType);
  const realm = input.realm?.trim() || (await readDefaultRealm());
  const banContext = input.banContext && Object.keys(input.banContext).length > 0 ? input.banContext : window.banContext;

  const rows = await targetedAnalysisService.createRecords({
    realm,
    subjectType,
    subjectNames,
    timeFrom: window.timeFrom,
    timeTo: window.timeTo,
    banContext: banContext ?? undefined,
    operatorId: 0,
    operatorName: 'mcp-agent',
  });

  return {
    timeFrom: window.timeFrom,
    timeTo: window.timeTo,
    timeWindowSource: window.source,
    realm,
    banContext: banContext ?? null,
    items: rows.map((row) => ({
      id: row.id,
      subjectName: row.subjectName,
      subjectType: subjectType,
      status: row.status,
      timeFrom: window.timeFrom,
      timeTo: window.timeTo,
    })),
  };
}

export async function listTargetedAnalyses(input: ListTargetedAnalysesInput = {}): Promise<ListTargetedAnalysesResult> {
  const page = Math.max(1, Math.floor(Number(input.page) || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(input.pageSize) || DEFAULT_PAGE_SIZE)));
  const status = input.status as AnalysisStatus | undefined;
  const result = await targetedAnalysisService.list(page, pageSize, input.subjectName?.trim() || undefined, status);
  return {
    total: result.total,
    page,
    pageSize,
    items: result.items.map((row) => ({
      id: row.id,
      realm: row.realm,
      subjectType: row.subjectType as AnalysisSubjectType,
      subjectName: row.subjectName,
      timeFrom: row.timeFrom ? new Date(row.timeFrom).toISOString() : null,
      timeTo: row.timeTo ? new Date(row.timeTo).toISOString() : null,
      status: row.status,
      hasReport: Boolean(row.conclusionMarkdown),
      triggeredBy: row.triggeredBy ?? null,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    })),
  };
}

export async function getTargetedAnalysis(id: number): Promise<GetTargetedAnalysisResult> {
  const row = await targetedAnalysisService.getById(id);
  return {
    id: row.id,
    realm: row.realm,
    subjectType: row.subjectType as AnalysisSubjectType,
    subjectName: row.subjectName,
    timeFrom: row.timeFrom ? new Date(row.timeFrom).toISOString() : null,
    timeTo: row.timeTo ? new Date(row.timeTo).toISOString() : null,
    status: row.status,
    hasReport: Boolean(row.conclusionMarkdown),
    conclusion: (row.conclusionJson as Record<string, unknown> | null) ?? null,
    conclusionMarkdown: row.conclusionMarkdown ?? null,
    gmRemark: row.gmRemark ?? null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}
