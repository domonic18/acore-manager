import 'reflect-metadata';
import '@/config/load-env';
import { initializeDataSourcesWithRetry } from '@/config/database';
import { logger } from '@/middleware/request-logger';
import { dashboardSnapshotService } from '@/services/dashboard-snapshot.service';
import { JOB_TASK } from '@/shared/enums/job-task';
import { yesterdayCST } from '@/shared/utils/cst-date.util';
import type { TaskHandler } from './registry';

export interface MetricsSnapshotTaskParams {
  date?: string;
  backfill?: boolean;
}

// 事件参数缺省值：date 未传取 CST 昨日；backfill=true 时忽略 date 做全历史一次性回填
export function resolveMetricsSnapshotParams(raw: Record<string, unknown>): MetricsSnapshotTaskParams {
  const { date, backfill } = raw;
  if (date !== undefined && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    throw new Error(`date 需为 YYYY-MM-DD，收到 ${String(date)}`);
  }
  return {
    date: (date as string | undefined) ?? yesterdayCST(),
    backfill: backfill === true,
  };
}

export const metricsSnapshotTask: TaskHandler = {
  name: JOB_TASK.METRICS_SNAPSHOT,
  async run(rawParams) {
    let params: MetricsSnapshotTaskParams;
    try {
      params = resolveMetricsSnapshotParams(rawParams);
    } catch (err) {
      logger.error(`[metrics-snapshot-task] ${(err as Error).message}`);
      return 2;
    }

    try {
      await initializeDataSourcesWithRetry();
    } catch (err) {
      logger.error(`[metrics-snapshot-task] 数据源初始化失败：${(err as Error).message}`);
      return 2;
    }

    try {
      if (params.backfill) {
        const result = await dashboardSnapshotService.backfillAll();
        logger.info(`[metrics-snapshot-task] backfill ${result.from} ~ ${result.to} days=${result.days}`);
      } else {
        const row = await dashboardSnapshotService.snapshotDate(params.date as string);
        logger.info(`[metrics-snapshot-task] date=${row.date} new=${row.newAccounts} active=${row.activeAccounts} peak=${row.peakOnline} bans=${row.bans}`);
      }
      return 0;
    } catch (err) {
      logger.error(`[metrics-snapshot-task] ${(err as Error).message}`);
      return 1;
    }
  },
};
