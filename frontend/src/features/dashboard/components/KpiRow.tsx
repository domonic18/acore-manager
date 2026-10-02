import { Skeleton } from '@/shared/components/Skeleton';
import type { DashboardStats } from '../api/dashboard.api';

// L2 今日运营 KPI 行：单卡五 tile（在线/新增/活跃/封禁/巡检分），
// 巡检分按阈值着色（≥80 绿 / ≥60 黄 / <60 红 / 无报告 —）

function KpiTile({ label, value, sub, valueClassName = '' }: { label: string; value: string; sub?: string; valueClassName?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold tabular-nums leading-tight ${valueClassName}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function inspectionTone(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'text-muted-foreground';
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  return 'text-red-400';
}

interface KpiRowProps {
  stats?: DashboardStats;
  loading?: boolean;
}

export default function KpiRow({ stats, loading = false }: KpiRowProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card px-5 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4">
          {['在线玩家', '今日新增账号', '今日活跃账号', '今日封禁', '巡检健康分'].map((label) => (
            <div key={label} className="space-y-1">
              <p className="text-xs text-muted-foreground">{label}</p>
              <Skeleton className="h-7 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const inspection = stats?.latestInspection ?? null;

  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4">
        <KpiTile
          label="在线玩家"
          value={String(stats?.onlinePlayers ?? 0)}
          sub={`实际玩家 ${stats?.multiBox?.distinctPlayers ?? stats?.onlinePlayers ?? 0} · 共 ${stats?.population?.totalCharacters ?? 0} 角色`}
        />
        <KpiTile label="今日新增账号" value={String(stats?.newAccountsToday ?? 0)} />
        <KpiTile label="今日活跃账号" value={String(stats?.activeAccountsToday ?? 0)} />
        <KpiTile label="今日封禁" value={String(stats?.bansToday ?? 0)} sub="账号级" />
        <KpiTile
          label="巡检健康分"
          value={inspection ? String(inspection.healthScore) : '—'}
          valueClassName={inspectionTone(inspection?.healthScore)}
          sub={inspection ? `${inspection.reportDate} · ${inspection.realm}` : '暂无巡检报告'}
        />
      </div>
    </div>
  );
}
