import 'reflect-metadata';
import '@/config/load-env';
import { In } from 'typeorm';
import { acmDataSource, initializeDataSourcesWithRetry } from '@/config/database';
import { AiTargetedAnalysis } from '@/entities/acm/ai-targeted-analysis.entity';
import { logger } from '@/middleware/request-logger';
import { formatCstDate } from '@/shared/utils/cst-date.util';
import { targetedAnalysisService } from '@/services/ai/targeted-analysis.service';
import {
  runTargetedAnalysis,
  type TargetedAnalysisSubject,
  type TargetedBanContext,
} from '@/services/ai/targeted-analysis.runner';
import { JOB_TASK } from '@/shared/enums/job-task';
import type { TaskHandler } from './registry';

export interface TargetedAnalysisTaskParams {
  ids: number[];
  /** 建行时的原始请求信息（按分析 ID 索引），保证结论 timeRange 与创建入参逐字一致 */
  meta?: Record<string, { timeFrom: string; timeTo: string; banContext?: TargetedBanContext }>;
}

export function resolveTargetedAnalysisParams(raw: Record<string, unknown>): TargetedAnalysisTaskParams {
  const { ids, meta } = raw as { ids?: unknown; meta?: unknown };
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => Number.isInteger(id) && id > 0)) {
    throw new Error(`ids 需为非空正整数数组，收到 ${JSON.stringify(ids)}`);
  }
  if (meta !== undefined && (typeof meta !== 'object' || meta === null || Array.isArray(meta))) {
    throw new Error('meta 需为以分析 ID 为键的对象');
  }
  return { ids: ids as number[], meta: meta as TargetedAnalysisTaskParams['meta'] };
}

export const targetedAnalysisTask: TaskHandler = {
  name: JOB_TASK.TARGETED_ANALYSIS,
  async run(rawParams) {
    let params: TargetedAnalysisTaskParams;
    try {
      params = resolveTargetedAnalysisParams(rawParams);
    } catch (err) {
      logger.error(`[targeted-analysis-task] ${(err as Error).message}`);
      return 2;
    }

    try {
      await initializeDataSourcesWithRetry();
    } catch (err) {
      logger.error(`[targeted-analysis-task] 数据源初始化失败：${(err as Error).message}`);
      return 2;
    }

    // 上次执行中断的僵尸行先归终态（本批行 created_at 刚生成，不受 15 分钟阈值影响）
    await targetedAnalysisService.sweepStaleRunning().catch((err: unknown) => {
      logger.warn(`[targeted-analysis-task] 僵尸记录扫荡失败：${(err as Error).message}`);
    });

    const rows = await acmDataSource.getRepository(AiTargetedAnalysis).find({ where: { id: In(params.ids) } });
    let failed = 0;
    for (const row of rows) {
      if (row.status !== 'running') {
        logger.warn(`[targeted-analysis-task] #${row.id} 状态为 ${row.status}，跳过`);
        continue;
      }
      const meta = params.meta?.[String(row.id)];
      const subject: TargetedAnalysisSubject = {
        realm: row.realm,
        subjectType: row.subjectType as TargetedAnalysisSubject['subjectType'],
        subjectName: row.subjectName,
        timeFrom: meta?.timeFrom ?? formatCstDate(row.timeFrom),
        timeTo: meta?.timeTo ?? formatCstDate(row.timeTo),
        banContext: meta?.banContext,
      };
      const outcome = await runTargetedAnalysis(row.id, subject);
      if (!outcome.ok) failed += 1;
      logger.info(
        `[targeted-analysis-task] #${row.id} ${row.subjectType}:${row.subjectName} ok=${outcome.ok}${outcome.error ? ` error=${outcome.error}` : ''}`,
      );
    }
    return failed === 0 ? 0 : 1;
  },
};
