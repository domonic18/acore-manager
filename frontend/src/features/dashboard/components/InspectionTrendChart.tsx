import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Skeleton } from '@/shared/components/Skeleton';
import { useDashboardTrends } from '../hooks/useDashboard';

// 巡检健康分趋势：来自 AI 巡检报告（status=ok）按日序列，0-100 分域，80 分达标参考线
// 数据同源运营趋势（useDashboardTrends 共享 query 缓存）

const REALM_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function ScoreTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey?: string | number; value?: number | null; color?: string }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md">
      <p className="text-sm font-medium text-popover-foreground">{label}</p>
      <div className="mt-1 space-y-0.5">
        {payload.map((item) => (
          <div key={String(item.dataKey)} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: item.color }} />
            <span className="text-muted-foreground">{String(item.dataKey)}</span>
            <span className="ml-auto pl-3 font-medium tabular-nums text-popover-foreground">
              {item.value} 分
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DateTick(props: { x?: number; y?: number; payload?: { value: string } }) {
  return (
    <text
      x={props.x || 0}
      y={(props.y || 0) + 10}
      textAnchor="middle"
      fill="hsl(var(--muted-foreground))"
      fontSize={10}
    >
      {(props.payload?.value || '').slice(5)}
    </text>
  );
}

export default function InspectionTrendChart() {
  const { data, isLoading } = useDashboardTrends(90);

  const { rows, realms } = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    const realmSet = new Set<string>();
    for (const p of data?.inspections ?? []) {
      realmSet.add(p.realm);
      const row = byDate.get(p.date) ?? { date: p.date };
      row[p.realm] = p.healthScore;
      byDate.set(p.date, row);
    }
    return {
      rows: [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))),
      realms: [...realmSet],
    };
  }, [data]);

  return (
    <div className="rounded-lg border border-border bg-card p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium">巡检健康分</h2>
        <span className="text-xs text-muted-foreground">近 90 天 · 80 分达标</span>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : realms.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
          暂无巡检数据
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 256 }}>
            <LineChart data={rows} margin={{ top: 5, right: 5, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                tick={<DateTick />}
                height={24}
                minTickGap={24}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip content={<ScoreTooltip />} />
              <ReferenceLine y={80} stroke="#10b981" strokeDasharray="4 3" strokeOpacity={0.6} />
              {realms.map((realm, i) => (
                <Line
                  key={realm}
                  type="monotone"
                  dataKey={realm}
                  stroke={REALM_COLORS[i % REALM_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 0, fill: REALM_COLORS[i % REALM_COLORS.length] }}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
