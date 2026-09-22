import { acmDataSource } from '@/config/database';
import { env } from '@/config/env';
import { AiTokenUsage } from '@/entities/acm/ai-token-usage.entity';
import { logger } from '@/middleware/request-logger';
import { cacheService } from '@/services/cache.service';
import { feishuNotifyService } from './feishu-notify.service';

// LLM 调用计量（arch 4.2）：每次对话/巡检轮次落一行，按日聚合报表 + 日预算飞书告警。
// 告警语义为"仅告警不停用"（需求 3.6）；同日只告警一次（Redis 去重）。

export interface TokenUsageRecordInput {
  scene: 'chat' | 'inspection';
  refId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
}

export interface TokenUsageDayRow {
  date: string;
  scene: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
}

export interface TokenUsageReport {
  from: string;
  to: string;
  budget: number;
  totalTokens: number;
  days: TokenUsageDayRow[];
}

const ALERT_DEDUP_TTL_SECONDS = 86400;

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

class TokenUsageService {
  private get repo() {
    return acmDataSource.getRepository(AiTokenUsage);
  }

  async record(input: TokenUsageRecordInput): Promise<void> {
    await this.repo.insert({ ...input, date: toDateStr(new Date()) });
    // 落库后异步检查预算，不阻塞主链路；失败只记日志
    void this.alertIfOverBudget(input.scene).catch((err) =>
      logger.error(`[token-usage] budget check failed: ${(err as Error).message}`),
    );
  }

  async getDailyTotal(date = toDateStr(new Date())): Promise<number> {
    const row = await this.repo
      .createQueryBuilder('u')
      .select('COALESCE(SUM(u.total_tokens), 0)', 'total')
      .where('u.date = :date', { date })
      .getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  async dailyReport(from: string, to: string): Promise<TokenUsageReport> {
    const rows = await this.repo
      .createQueryBuilder('u')
      .select('u.date', 'date')
      .addSelect('u.scene', 'scene')
      .addSelect('COUNT(*)', 'calls')
      .addSelect('SUM(u.prompt_tokens)', 'promptTokens')
      .addSelect('SUM(u.completion_tokens)', 'completionTokens')
      .addSelect('SUM(u.total_tokens)', 'totalTokens')
      .addSelect('SUM(u.duration_ms)', 'durationMs')
      .where('u.date >= :from AND u.date <= :to', { from, to })
      .groupBy('u.date')
      .addGroupBy('u.scene')
      .orderBy('u.date', 'DESC')
      .addOrderBy('u.scene', 'ASC')
      .getRawMany<Record<string, string>>();

    const days: TokenUsageDayRow[] = rows.map((r) => ({
      date: r.date,
      scene: r.scene,
      calls: Number(r.calls),
      promptTokens: Number(r.promptTokens),
      completionTokens: Number(r.completionTokens),
      totalTokens: Number(r.totalTokens),
      durationMs: Number(r.durationMs),
    }));

    return {
      from,
      to,
      budget: env.AI_DAILY_TOKEN_BUDGET,
      totalTokens: days.reduce((sum, d) => sum + d.totalTokens, 0),
      days,
    };
  }

  private async alertIfOverBudget(scene: string): Promise<void> {
    const date = toDateStr(new Date());
    const total = await this.getDailyTotal(date);
    if (total <= env.AI_DAILY_TOKEN_BUDGET) return;

    const dedupKey = `acm:ai:token-budget:alerted:${date}`;
    const alerted = await cacheService.get<string>(dedupKey);
    if (alerted) return;

    await feishuNotifyService.sendText(
      `[ACM] AI Token 日预算超限：${date} 已消耗 ${total} tokens（预算 ${env.AI_DAILY_TOKEN_BUDGET}，场景 ${scene}）。仅告警不停用，请关注用量。`,
    );
    await cacheService.set(dedupKey, '1', ALERT_DEDUP_TTL_SECONDS);
  }
}

export const tokenUsageService = new TokenUsageService();
