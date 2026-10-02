import 'reflect-metadata';
import '@/config/load-env';
import { initializeDataSourcesWithRetry } from '@/config/database';
import { logger } from '@/middleware/request-logger';
import { abusePatrolService } from '@/services/abuse-patrol.service';
import { JOB_TASK } from '@/shared/enums/job-task';
import type { TaskHandler } from './registry';

export interface BgHonorFarmTaskParams {
  /** 覆盖增量游标，扫描最近 N 小时（手动补扫用） */
  hours?: number;
}

// 事件参数缺省值：无 hours 时按 patrol_bg_cursor 游标增量（缺省回退 1h）
export function resolveBgHonorFarmParams(raw: Record<string, unknown>): BgHonorFarmTaskParams {
  const { hours } = raw;
  if (hours !== undefined && (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0 || hours > 168)) {
    throw new Error(`hours 需为 (0, 168] 内数值，收到 ${String(hours)}`);
  }
  return { hours: hours as number | undefined };
}

export const bgHonorFarmTask: TaskHandler = {
  name: JOB_TASK.BG_HONOR_FARM,
  async run(rawParams) {
    let params: BgHonorFarmTaskParams;
    try {
      params = resolveBgHonorFarmParams(rawParams);
    } catch (err) {
      logger.error(`[bg-honor-farm-task] ${(err as Error).message}`);
      return 2;
    }

    try {
      await initializeDataSourcesWithRetry();
    } catch (err) {
      logger.error(`[bg-honor-farm-task] 数据源初始化失败：${(err as Error).message}`);
      return 2;
    }

    try {
      const result = await abusePatrolService.runBgHonorFarmScan(params);
      logger.info(`[bg-honor-farm-task] ${JSON.stringify(result)}`);
      return 0;
    } catch (err) {
      logger.error(`[bg-honor-farm-task] ${(err as Error).message}`);
      return 1;
    }
  },
};
