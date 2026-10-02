import 'reflect-metadata';
import '@/config/load-env';
import { initializeDataSources } from '@/config/database';
import { logger } from '@/middleware/request-logger';
import { dashboardSnapshotService } from '@/services/dashboard-snapshot.service';
import { acmDataSource } from '@/config/database';
import { DashboardDailyStats } from '@/entities/acm/dashboard-daily-stats.entity';

// 运营趋势快照一次性回填脚本（本地/运维用，job 上线前先由它灌历史）：
// npm run build && node dist/scripts/dashboard-snapshot-backfill.js
// 可选参数 --date=YYYY-MM-DD 单日快照（默认全历史回填）

async function main(): Promise<void> {
  await initializeDataSources();
  const dateArg = process.argv.find((a) => a.startsWith('--date='));
  if (dateArg) {
    const row = await dashboardSnapshotService.snapshotDate(dateArg.split('=')[1]);
    logger.info(`单日快照完成: ${JSON.stringify(row)}`);
  } else {
    const result = await dashboardSnapshotService.backfillAll();
    logger.info(`回填完成: ${result.from} ~ ${result.to}，共 ${result.days} 天`);
  }
  const latest = await acmDataSource.getRepository(DashboardDailyStats).find({
    order: { statDate: 'DESC' },
    take: 5,
  });
  logger.info(`最新 5 行: ${JSON.stringify(latest.map((r) => ({ d: r.statDate, new_: r.newAccounts, act: r.activeAccounts, peak: r.peakOnline, bans: r.bans })))}`);
  process.exit(0);
}

main().catch((err) => {
  logger.error(`回填失败: ${(err as Error).message}`);
  process.exit(1);
});
