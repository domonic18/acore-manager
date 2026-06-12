import { useDashboardStats } from '@/features/dashboard/hooks/useDashboard';
import PopulationStats from '@/features/dashboard/components/PopulationStats';
import FriendStats from '@/features/dashboard/components/FriendStats';

export default function DashboardPage() {
  const { data: stats, isLoading } = useDashboardStats();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="在线玩家"
          value={stats?.onlinePlayers ?? 0}
          loading={isLoading}
        />
        <StatCard
          title="今日新增账号"
          value={stats?.newAccountsToday ?? 0}
          loading={isLoading}
        />
        <StatCard
          title="今日活跃账号"
          value={stats?.activeAccountsToday ?? 0}
          loading={isLoading}
        />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">账号角色统计</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            title="单账号最多角色"
            value={stats?.accountCharacters?.maxPerAccount ?? 0}
            loading={isLoading}
          />
          <StatCard
            title="单账号最少角色"
            value={stats?.accountCharacters?.minPerAccount ?? 0}
            loading={isLoading}
          />
          <StatCard
            title="无角色账号"
            value={stats?.accountCharacters?.accountsWithoutCharacters ?? 0}
            loading={isLoading}
          />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">人口统计</h2>
        <PopulationStats
          totalCharacters={stats?.population?.totalCharacters ?? 0}
          levelDistribution={stats?.population?.levelDistribution ?? []}
          raceDistribution={stats?.population?.raceDistribution ?? []}
          classDistribution={stats?.population?.classDistribution ?? []}
          loading={isLoading}
        />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">好友统计</h2>
        <FriendStats
          distribution={stats?.friends?.distribution ?? []}
          topAccounts={stats?.friends?.topAccounts ?? []}
          loading={isLoading}
        />
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  loading,
}: {
  title: string;
  value: number;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-3xl font-bold mt-2">
        {loading ? '-' : value}
      </p>
    </div>
  );
}
