import { MoreThanOrEqual } from 'typeorm';
import { acmDataSource } from '@/config/database';
import { AiReport } from '@/entities/acm/ai-report.entity';
import { DashboardDailyStats } from '@/entities/acm/dashboard-daily-stats.entity';

// 运营趋势查询：只读 acm PG 快照表（job 写入），零生产 MySQL 压力；
// 累计注册线的基线 = 窗口起点前所有快照日新增之和（同表可得，无需查 MySQL）。

export interface TrendPoint {
  date: string;
  newAccounts: number;
  activeAccounts: number | null;
  peakOnline: number | null;
  bans: number;
}

export interface InspectionPoint {
  date: string;
  realm: string;
  healthScore: number;
}

export interface DashboardTrends {
  days: number;
  series: TrendPoint[];
  cumulative: { baseline: number; points: { date: string; total: number }[] };
  inspections: InspectionPoint[];
}

function shiftDate(date: string, deltaDays: number): string {
  const d = new Date(`${date}T00:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export class DashboardTrendsService {
  async getTrends(days: number, todayCST: string): Promise<DashboardTrends> {
    const from = shiftDate(todayCST, -(days - 1));

    const [rows, reports] = await Promise.all([
      acmDataSource.getRepository(DashboardDailyStats).find({
        where: { statDate: MoreThanOrEqual(from) },
        order: { statDate: 'ASC' },
      }),
      acmDataSource.getRepository(AiReport).find({
        where: { status: 'ok' },
        order: { reportDate: 'ASC' },
      }),
    ]);

    const byDate = new Map(rows.map((r) => [r.statDate, r]));
    const series: TrendPoint[] = [];
    for (let i = 0; i < days; i++) {
      const date = shiftDate(from, i);
      const row = byDate.get(date);
      series.push({
        date,
        newAccounts: row?.newAccounts ?? 0,
        activeAccounts: row?.activeAccounts ?? null,
        peakOnline: row?.peakOnline ?? null,
        bans: row?.bans ?? 0,
      });
    }

    // 基线：窗口起点之前的所有快照日新增之和
    const before = await this.sumNewAccountsBefore(from);
    const cumulativePoints: { date: string; total: number }[] = [];
    let running = before;
    for (const point of series) {
      running += point.newAccounts;
      cumulativePoints.push({ date: point.date, total: running });
    }

    const inspections: InspectionPoint[] = reports
      .map((r) => ({ date: String(r.reportDate).slice(0, 10), realm: r.realm, healthScore: r.healthScore }))
      .filter((p) => p.date >= shiftDate(todayCST, -90));

    return { days, series, cumulative: { baseline: before, points: cumulativePoints }, inspections };
  }

  private async sumNewAccountsBefore(from: string): Promise<number> {
    const rows = await acmDataSource.getRepository(DashboardDailyStats)
      .createQueryBuilder('s')
      .select('COALESCE(SUM(s.newAccounts), 0)', 'total')
      .where('s.statDate < :from', { from })
      .getRawOne();
    return parseInt(rows?.total ?? '0', 10);
  }
}

export const dashboardTrendsService = new DashboardTrendsService();
