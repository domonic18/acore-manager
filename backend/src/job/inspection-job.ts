import 'reflect-metadata';
import '@/config/load-env';
import { initializeDataSourcesWithRetry } from '@/config/database';
import { logger } from '@/middleware/request-logger';
import { inspectionService, InspectionTrigger } from '@/services/ai/inspection.service';
import { yesterdayCST } from '@/shared/utils/cst-date.util';

// T3.3 Job 函数形态：SCF 定时触发的一次性巡检入口（docker/Dockerfile.job CMD 直接执行）。
// 退出码语义：0 = 巡检成功；1 = 巡检失败（服务内部已落 failed 行并告警）；2 = 启动致命错误
// （参数非法 / 数据源不可达），未进入巡检流程。

export interface JobArgs {
  realm: string;
  date: string;
  trigger: InspectionTrigger;
}

export function parseJobArgs(argv: string[], now: Date = new Date()): JobArgs {
  let realm: string | undefined;
  let date: string | undefined;
  let trigger: InspectionTrigger = 'cron';

  for (const arg of argv) {
    if (arg.startsWith('--realm=')) {
      realm = arg.slice('--realm='.length).trim();
    } else if (arg.startsWith('--date=')) {
      date = arg.slice('--date='.length).trim();
    } else if (arg.startsWith('--trigger=')) {
      trigger = arg.slice('--trigger='.length).trim() as InspectionTrigger;
    } else {
      throw new Error(`未知参数 ${arg}（支持 --realm=<realm> --date=YYYY-MM-DD --trigger=cron|manual）`);
    }
  }
  if (!realm) throw new Error('缺少必填参数 --realm=<realm>');
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`--date 需为 YYYY-MM-DD，收到 ${date}`);
  }
  if (trigger !== 'cron' && trigger !== 'manual') {
    throw new Error(`--trigger 仅支持 cron|manual，收到 ${trigger}`);
  }

  // 未传 --date 时取上海时区（CST）的昨日
  if (date === undefined) {
    date = yesterdayCST(now);
  }

  return { realm, date, trigger };
}

export async function runJob(argv: string[]): Promise<number> {
  let args: JobArgs;
  try {
    args = parseJobArgs(argv);
  } catch (err) {
    logger.error(`[inspection-job] ${(err as Error).message}`);
    return 2;
  }

  try {
    await initializeDataSourcesWithRetry();
  } catch (err) {
    logger.error(`[inspection-job] 数据源初始化失败：${(err as Error).message}`);
    return 2;
  }

  const outcome = await inspectionService.run({ realm: args.realm, date: args.date, trigger: args.trigger });
  logger.info(`[inspection-job] realm=${args.realm} date=${args.date} ok=${outcome.ok} reportId=${outcome.reportId} elapsedMs=${outcome.elapsedMs}`);
  return outcome.ok ? 0 : 1;
}

if (require.main === module) {
  void runJob(process.argv.slice(2)).then((code) => process.exit(code));
}
