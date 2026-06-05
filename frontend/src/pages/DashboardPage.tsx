import { useDashboardStats } from '@/features/dashboard/hooks/useDashboard';

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
