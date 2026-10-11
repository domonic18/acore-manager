import { acmDataSource } from '@/config/database';
import { AiWatchlist } from '@/entities/acm/ai-watchlist.entity';
import { auditLogService } from '@/services/audit-log.service';
import { logger } from '@/middleware/request-logger';
import { ServiceError } from '@/shared/errors/service-error';

// 观察名单（2026-10 反作弊优化）：黑/白 × 角色/账号两级，(realm, subjectType, subjectName) 唯一，
// 黑白互斥（切换走 update）。巡检与定向分析经 digestForRealm 注入任务提示词：
// 黑名单命中升档重点分析，白名单命中降档；digest 永不抛错，DB 异常降级中性文案绝不阻断检测链路。

const DIGEST_MAX_PER_LIST = 50;

export interface WatchlistInput {
  listType: 'white' | 'black';
  subjectType: 'character' | 'account';
  subjectName: string;
  realm: string;
  reason: string;
}

export interface WatchlistFilters {
  realm?: string;
  listType?: 'white' | 'black';
}

function describe(item: AiWatchlist): string {
  return `${item.listType === 'black' ? '黑' : '白'}名单 ${item.subjectType === 'account' ? '账号' : '角色'} ${item.subjectName}@${item.realm}`;
}

export class WatchlistService {
  async list(filters?: WatchlistFilters): Promise<AiWatchlist[]> {
    const repo = acmDataSource.getRepository(AiWatchlist);
    const where: Record<string, unknown> = {};
    if (filters?.realm) where.realm = filters.realm;
    if (filters?.listType) where.listType = filters.listType;
    return repo.find({ where, order: { id: 'DESC' } });
  }

  async create(input: WatchlistInput, operatorId: number, operatorName: string): Promise<AiWatchlist> {
    const repo = acmDataSource.getRepository(AiWatchlist);
    const existing = await repo.findOne({
      where: { realm: input.realm, subjectType: input.subjectType, subjectName: input.subjectName },
    });
    if (existing) {
      throw new ServiceError(`该对象已在名单中（${describe(existing)}），切换黑白请用编辑`, 409);
    }
    const saved = await repo.save(
      repo.create({
        listType: input.listType,
        subjectType: input.subjectType,
        subjectName: input.subjectName,
        realm: input.realm,
        reason: input.reason,
        createdBy: operatorName,
      }),
    );
    await auditLogService.record({
      operatorId,
      operatorName,
      operation: 'ai.watchlist.create',
      target: `watchlist:${saved.id}`,
      details: `${describe(saved)}：${input.reason}`,
    });
    return saved;
  }

  async update(id: number, patch: Partial<WatchlistInput>, operatorId: number, operatorName: string): Promise<AiWatchlist> {
    const repo = acmDataSource.getRepository(AiWatchlist);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new ServiceError('名单条目不存在', 404);
    if (patch.listType !== undefined) existing.listType = patch.listType;
    if (patch.subjectType !== undefined) existing.subjectType = patch.subjectType;
    if (patch.subjectName !== undefined) existing.subjectName = patch.subjectName;
    if (patch.realm !== undefined) existing.realm = patch.realm;
    if (patch.reason !== undefined) existing.reason = patch.reason;
    const clash = await repo.findOne({
      where: { realm: existing.realm, subjectType: existing.subjectType, subjectName: existing.subjectName },
    });
    if (clash && clash.id !== id) {
      throw new ServiceError(`该对象已在名单中（${describe(clash)}）`, 409);
    }
    const saved = await repo.save(existing);
    await auditLogService.record({
      operatorId,
      operatorName,
      operation: 'ai.watchlist.update',
      target: `watchlist:${id}`,
      details: `${describe(saved)}：${saved.reason}`,
    });
    return saved;
  }

  async remove(id: number, operatorId: number, operatorName: string): Promise<void> {
    const repo = acmDataSource.getRepository(AiWatchlist);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new ServiceError('名单条目不存在', 404);
    await repo.remove(existing);
    await auditLogService.record({
      operatorId,
      operatorName,
      operation: 'ai.watchlist.remove',
      target: `watchlist:${id}`,
      details: describe(existing),
    });
  }

  /** 任务提示词注入摘要：黑前白后各截断 50 条；DB 异常降级中性文案，绝不阻断检测链路 */
  async digestForRealm(realm: string): Promise<string> {
    try {
      const items = await acmDataSource.getRepository(AiWatchlist).find({ where: { realm }, order: { id: 'DESC' } });
      if (items.length === 0) return '观察名单：无。';
      const format = (list: AiWatchlist[]): string[] =>
        list.slice(0, DIGEST_MAX_PER_LIST).map((i) => `- [${i.subjectType === 'account' ? '账号' : '角色'}] ${i.subjectName}（${i.reason}）`).concat(
          list.length > DIGEST_MAX_PER_LIST ? [`…另有 ${list.length - DIGEST_MAX_PER_LIST} 条`] : [],
        );
      const blacks = format(items.filter((i) => i.listType === 'black'));
      const whites = format(items.filter((i) => i.listType === 'white'));
      const parts: string[] = [];
      if (blacks.length > 0) parts.push(`黑名单（重点分析，命中即升档）：\n${blacks.join('\n')}`);
      if (whites.length > 0) parts.push(`白名单（检出异常降档）：\n${whites.join('\n')}`);
      return parts.length > 0 ? `观察名单：\n${parts.join('\n')}` : '观察名单：无。';
    } catch (err) {
      logger.warn({ err, realm }, 'watchlist digestForRealm failed, degrading to neutral note');
      return '观察名单：暂不可用。';
    }
  }
}

export const watchlistService = new WatchlistService();
