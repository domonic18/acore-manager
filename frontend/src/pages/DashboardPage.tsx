import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useDashboardStats, useHealthDetail } from '@/features/dashboard/hooks/useDashboard';
import ServerStatusCard from '@/features/dashboard/components/ServerStatusCard';
import KpiRow from '@/features/dashboard/components/KpiRow';
import OperationTrendChart from '@/features/dashboard/components/OperationTrendChart';
import InspectionTrendChart from '@/features/dashboard/components/InspectionTrendChart';
import PopulationStats from '@/features/dashboard/components/PopulationStats';
import FriendStats from '@/features/dashboard/components/FriendStats';

// 管理总览：L1 服务器运行状态 → L2 今日运营 KPI → L3 运营趋势（宽图+巡检分）→ L4 人口结构 → L5 弱信号折叠区
// 运营趋势读 acm PG 快照表（job 每日聚合），页面可滚动不追求一屏

export default function DashboardPage() {
  const { data: stats, isLoading, dataUpdatedAt } = useDashboardStats();
  const { data: health } = useHealthDetail();
  // 受控 details：收起时不渲染内容（closed details 在 Chromium 仍占布局），并顺带延迟加载图表
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">管理总览</h1>
        {dataUpdatedAt > 0 && (
          <span className="text-xs text-muted-foreground">
            数据更新于 {new Date(dataUpdatedAt).toLocaleTimeString('zh-CN', { hour12: false })} · 30s 自动刷新
          </span>
        )}
      </div>

      <ServerStatusCard realms={stats?.realms ?? []} health={health} loading={isLoading} />

      <KpiRow stats={stats} loading={isLoading} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2 min-w-0">
          <OperationTrendChart />
        </div>
        <InspectionTrendChart />
      </div>

      <PopulationStats
        totalCharacters={stats?.population?.totalCharacters ?? 0}
        levelDistribution={stats?.population?.levelDistribution ?? []}
        raceDistribution={stats?.population?.raceDistribution ?? []}
        classDistribution={stats?.population?.classDistribution ?? []}
        loading={isLoading}
      />

      <details
        open={moreOpen}
        onToggle={(e) => setMoreOpen(e.currentTarget.open)}
        className="group/open rounded-lg border border-border bg-card"
      >
        <summary className="flex cursor-pointer select-none items-center gap-2 px-5 py-3 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
          更多统计 · 账号角色与好友
        </summary>
        {moreOpen && (
          <div className="space-y-4 border-t border-border p-5">
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <AccountMetric label="单账号最多角色" value={stats?.accountCharacters?.maxPerAccount ?? 0} />
              <AccountMetric label="单账号最少角色" value={stats?.accountCharacters?.minPerAccount ?? 0} />
              <AccountMetric label="无角色账号" value={stats?.accountCharacters?.accountsWithoutCharacters ?? 0} />
            </div>
            <FriendStats
              distribution={stats?.friends?.distribution ?? []}
              topCharacters={stats?.friends?.topCharacters ?? []}
              loading={isLoading}
            />
          </div>
        )}
      </details>
    </div>
  );
}

function AccountMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-sm font-medium tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
