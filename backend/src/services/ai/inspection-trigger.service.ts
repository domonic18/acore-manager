import { redis } from '@/config/redis';
import { logger } from '@/middleware/request-logger';
import { triggerJob } from '@/services/job-trigger.service';
import { JOB_TASK } from '@/shared/enums/job-task';
import { ServiceError } from '@/shared/errors/service-error';

// 手动巡检防呆（T3.4）：SCF Job 异步受理、报告 1-2 分钟后才落库（ai_report 仅终态行，无 running 态可查），
// 以 Redis SETNX 互斥锁（TTL 10 分钟）阻止同一 realm/date 重复触发产生并发 Job 浪费模型用量；
// Redis 不可用时降级放行（与缓存同语义，不因 Redis 阻塞巡检），触发失败即时释放锁避免误冷却。

const LOCK_TTL_SECONDS = 600;

const lockKey = (realm?: string, date?: string): string =>
  `acm:job-lock:${JOB_TASK.INSPECTION}:${realm ?? '-'}:${date ?? '-'}`;

export async function triggerInspectionJob(params: {
  realm?: string;
  date?: string;
  operator: string;
}): Promise<{ requestId: string | null }> {
  const { realm, date, operator } = params;
  let acquired: string | null;
  try {
    acquired = await redis.set(lockKey(realm, date), operator, 'EX', LOCK_TTL_SECONDS, 'NX');
  } catch (err) {
    logger.warn(`[inspection-trigger] Redis 不可用，防重复锁降级放行：${(err as Error).message}`);
    acquired = 'skip';
  }
  if (acquired === null) {
    throw new ServiceError('该服务器/日期的巡检已触发且进行中（约 1-2 分钟出报告），请稍后刷新查看，勿重复触发', 429);
  }
  try {
    return await triggerJob(JOB_TASK.INSPECTION, {
      realm,
      ...(date ? { date } : {}),
      trigger: 'manual',
    });
  } catch (err) {
    await redis.del(lockKey(realm, date)).catch(() => {});
    throw err;
  }
}
