import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useNavigate } from 'react-router-dom';
import type { DistributionItem, FriendTopAccount } from '../api/dashboard.api';

const FRIEND_BUCKET_LABELS: Record<number, string> = {
  0: '0',
  1: '1-5',
  2: '6-10',
  3: '11-20',
  4: '21-50',
  5: '50+',
};

interface TooltipPayloadItem {
  payload?: {
    label?: string;
    count?: number;
  };
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  if (!data) return null;

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md">
      <p className="text-sm font-medium text-popover-foreground">{data.label} 好友</p>
      <p className="text-xs text-muted-foreground mt-0.5">角色数: {data.count}</p>
    </div>
  );
}

interface FriendStatsProps {
  distribution: DistributionItem[];
  topAccounts: FriendTopAccount[];
  loading?: boolean;
}

export default function FriendStats({ distribution, topAccounts, loading = false }: FriendStatsProps) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-6 animate-pulse">
            <div className="h-4 bg-muted rounded w-1/3 mb-4" />
            <div className="h-64 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  const distributionData = distribution.map((item) => ({
    key: item.key,
    label: FRIEND_BUCKET_LABELS[item.key] || `${item.key}`,
    count: item.count,
  }));

  // Fill missing buckets with 0 for consistent display
  const allBuckets = [0, 1, 2, 3, 4, 5].map((key) => {
    const found = distributionData.find((d) => d.key === key);
    return found || { key, label: FRIEND_BUCKET_LABELS[key], count: 0 };
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Friend Distribution Chart */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-sm font-medium mb-4">角色好友数量分布</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={allBuckets} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                interval={0}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip content={<CustomTooltip />} contentStyle={{ background: 'transparent', border: 'none', padding: 0 }} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top 5 Accounts by Friends */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-sm font-medium mb-4">好友数量 Top 5 账号</h3>
        <div className="space-y-3">
          {topAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">暂无数据</p>
          ) : (
            topAccounts.map((account, index) => (
              <div
                key={account.accountId}
                className="flex items-center justify-between rounded-md bg-muted/50 px-4 py-3 cursor-pointer hover:bg-muted transition-colors"
                onClick={() => navigate(`/accounts/${account.accountId}`)}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: index === 0 ? '#f59e0b' : index === 1 ? '#94a3b8' : index === 2 ? '#b45309' : 'hsl(var(--muted))',
                      color: index < 3 ? '#fff' : 'hsl(var(--muted-foreground))',
                    }}
                  >
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium">{account.username}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-lg font-bold">{account.friendCount}</span>
                  <span className="text-xs text-muted-foreground">好友</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
