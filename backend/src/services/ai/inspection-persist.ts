import { acmDataSource } from '@/config/database';
import { logger } from '@/middleware/request-logger';
import { AiReport } from '@/entities/acm/ai-report.entity';
import { REPORT_SCHEMA_VERSION, type InspectionReportJson } from '@/agent/tools/report-tools';
import { cosPutObjectBuffer } from '@/shared/utils/cos.util';
import { cacheService } from '@/services/cache.service';
import { tokenUsageService } from './token-usage.service';
import { feishuNotifyService } from './feishu-notify.service';

// 巡检结果持久化（inspection.service 拆分）：ai_report 幂等 upsert（token 用量随行）
// → COS 归档（失败不阻塞）→ Redis 摘要 → token 计量 → 飞书日报卡片。
// recordInspectionFailure 落 status=failed 行；失败行本身再失败仅记日志返回 null。

const ARCHIVE_PREFIX = 'acore-ai-reports';
const REPORT_CACHE_TTL_SECONDS = 7 * 24 * 3600;

export interface InspectionPersistInput {
  realm: string;
  date: string;
  trigger: 'cron' | 'manual' | 'chat';
}

export interface InspectionUsage {
  model: string;
  tokens: { prompt: number; completion: number; total: number };
  durationMs: number;
}

export async function persistInspection(
  input: InspectionPersistInput,
  report: InspectionReportJson,
  markdown: string,
  usage: InspectionUsage,
  dataGaps: string[] = [],
): Promise<number> {
  const repo = acmDataSource.getRepository(AiReport);
  const saved = await repo.upsert(
    {
      realm: input.realm,
      reportDate: input.date,
      schemaVersion: report.schemaVersion,
      healthScore: report.healthScore,
      summary: report.summary.slice(0, 500),
      contentJson: { ...report } as any,
      contentMarkdown: markdown,
      tokenUsage: usage.tokens as any,
      generatedBy: input.trigger,
      status: 'ok',
    },
    ['realm', 'reportDate'],
  );
  const reportId = Number((saved as unknown as { identifiers?: { id: number }[] })?.identifiers?.[0]?.id ?? 0) || (await findReportId(input));

  void tokenUsageService
    .record({
      scene: 'inspection',
      refId: `${input.realm}/${input.date}`,
      model: usage.model,
      promptTokens: usage.tokens.prompt,
      completionTokens: usage.tokens.completion,
      totalTokens: usage.tokens.total,
      durationMs: usage.durationMs,
    })
    .catch((err: unknown) => logger.error(`[inspection] token record failed: ${(err as Error).message}`));

  void archiveAndNotify(input, report, markdown, dataGaps).catch((err: unknown) => logger.error(`[inspection] archive/notify failed: ${(err as Error).message}`));
  logger.info(`[inspection] report persisted ${input.realm}/${input.date} healthScore=${report.healthScore} id=${reportId}`);
  return reportId;
}

async function findReportId(input: InspectionPersistInput): Promise<number> {
  const row = await acmDataSource.getRepository(AiReport).findOne({ where: { realm: input.realm, reportDate: input.date } });
  return row?.id ?? 0;
}

// COS 归档 + Redis 摘要 + 飞书简报（T3.5 日报卡片：研判结论/指标网格/TOP 玩家/处置建议/报告链接）
async function archiveAndNotify(input: InspectionPersistInput, report: InspectionReportJson, markdown: string, dataGaps: string[]): Promise<void> {
  try {
    const json = { ...report, generatedAt: new Date().toISOString() };
    await cosPutObjectBuffer(`${ARCHIVE_PREFIX}/${input.realm}/${input.date}.json`, Buffer.from(JSON.stringify(json, null, 2)), 'application/json');
    await cosPutObjectBuffer(`${ARCHIVE_PREFIX}/${input.realm}/${input.date}.md`, Buffer.from(markdown), 'text/markdown');
  } catch (err) {
    logger.warn(`[inspection] COS archive failed (report kept in DB): ${(err as Error).message}`);
  }

  await cacheService.set(
    `acm:ai:report:latest:${input.realm}`,
    { realm: input.realm, date: input.date, healthScore: report.healthScore, summary: report.summary.slice(0, 500), suspiciousCount: report.suspiciousPlayers.length },
    REPORT_CACHE_TTL_SECONDS,
  );

  void feishuNotifyService.sendDailyReportCard({
    realm: input.realm,
    date: input.date,
    trigger: input.trigger,
    healthScore: report.healthScore,
    summary: report.summary,
    serverHealth: report.serverHealth,
    suspiciousPlayers: report.suspiciousPlayers,
    recommendations: report.recommendations,
    ...(dataGaps.length > 0 ? { dataGaps } : {}),
  });
}

export async function recordInspectionFailure(input: InspectionPersistInput, message: string): Promise<number | null> {
  try {
    const repo = acmDataSource.getRepository(AiReport);
    const saved = await repo.upsert(
      {
        realm: input.realm,
        reportDate: input.date,
        schemaVersion: REPORT_SCHEMA_VERSION,
        healthScore: 0,
        summary: `巡检失败：${message}`.slice(0, 500),
        contentJson: { error: message } as any,
        contentMarkdown: '',
        tokenUsage: null,
        generatedBy: input.trigger,
        status: 'failed',
      },
      ['realm', 'reportDate'],
    );
    return Number((saved as unknown as { identifiers?: { id: number }[] })?.identifiers?.[0]?.id ?? 0) || null;
  } catch (err) {
    logger.error(`[inspection] record failure row failed: ${(err as Error).message}`);
    return null;
  }
}
