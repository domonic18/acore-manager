import 'reflect-metadata';
import '@/config/load-env';
import { initializeDataSourcesWithRetry } from '@/config/database';
import { readDefaultRealm } from '@/config/system-config.reader';
import { logger } from '@/middleware/request-logger';
import { inspectionService, InspectionTrigger } from '@/services/ai/inspection.service';
import { JOB_TASK } from '@/shared/enums/job-task';
import { yesterdayCST } from '@/shared/utils/cst-date.util';
import type { TaskHandler } from './registry';

export interface InspectionTaskParams {
  realm?: string;
  date?: string;
  trigger?: InspectionTrigger;
}

const TRIGGERS: readonly InspectionTrigger[] = ['cron', 'manual', 'chat'];

// 事件参数缺省值的唯一来源：date 未传取上海时区（CST）昨日（定时触发器不传 date），trigger 未传按 cron
export function resolveInspectionParams(raw: Record<string, unknown>, now: Date = new Date()): InspectionTaskParams {
  const { realm, date, trigger } = raw;
  if (realm !== undefined && (typeof realm !== 'string' || realm.trim() === '')) {
    throw new Error('realm 需为非空字符串');
  }
  if (date !== undefined && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    throw new Error(`date 需为 YYYY-MM-DD，收到 ${String(date)}`);
  }
  if (trigger !== undefined && !TRIGGERS.includes(trigger as InspectionTrigger)) {
    throw new Error(`trigger 仅支持 ${TRIGGERS.join('|')}，收到 ${String(trigger)}`);
  }
  return {
    realm: realm as string | undefined,
    date: (date as string | undefined) ?? yesterdayCST(now),
    trigger: (trigger as InspectionTrigger | undefined) ?? 'cron',
  };
}

export const inspectionTask: TaskHandler = {
  name: JOB_TASK.INSPECTION,
  async run(rawParams) {
    let params: InspectionTaskParams;
    try {
      params = resolveInspectionParams(rawParams);
    } catch (err) {
      logger.error(`[inspection-task] ${(err as Error).message}`);
      return 2;
    }

    try {
      await initializeDataSourcesWithRetry();
    } catch (err) {
      logger.error(`[inspection-task] 数据源初始化失败：${(err as Error).message}`);
      return 2;
    }

    // realm 回落必须在数据源就绪之后（default_realm 存于 acm PG）
    const realm = params.realm ?? (await readDefaultRealm());

    const outcome = await inspectionService.run({ realm, date: params.date as string, trigger: params.trigger as InspectionTrigger });
    logger.info(`[inspection-task] realm=${realm} date=${params.date} trigger=${params.trigger} ok=${outcome.ok} reportId=${outcome.reportId} elapsedMs=${outcome.elapsedMs}`);
    return outcome.ok ? 0 : 1;
  },
};
