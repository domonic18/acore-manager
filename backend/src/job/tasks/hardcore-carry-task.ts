import 'reflect-metadata';
import '@/config/load-env';
import { initializeDataSourcesWithRetry } from '@/config/database';
import { logger } from '@/middleware/request-logger';
import { abusePatrolService } from '@/services/abuse-patrol.service';
import { JOB_TASK } from '@/shared/enums/job-task';
import type { TaskHandler } from './registry';

// 在线快照扫描，无窗口参数：坐标滞后 ≤15min（PlayerSaveInterval 900s），靠轮次合并升级
export const hardcoreCarryTask: TaskHandler = {
  name: JOB_TASK.HARDCORE_CARRY,
  async run() {
    try {
      await initializeDataSourcesWithRetry();
    } catch (err) {
      logger.error(`[hardcore-carry-task] 数据源初始化失败：${(err as Error).message}`);
      return 2;
    }

    try {
      const result = await abusePatrolService.runHardcoreCarryScan();
      logger.info(`[hardcore-carry-task] ${JSON.stringify(result)}`);
      return 0;
    } catch (err) {
      logger.error(`[hardcore-carry-task] ${(err as Error).message}`);
      return 1;
    }
  },
};
