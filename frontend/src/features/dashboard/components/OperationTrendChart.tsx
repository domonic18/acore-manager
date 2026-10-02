import { useMemo, useState } from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Skeleton } from '@/shared/components/Skeleton';
import { cn } from '@/shared/lib/utils';
import { useDashboardTrends } from '../hooks/useDashboard';

// 宽幅运营趋势图：数据全部来自 acm PG 快照表（job 每日聚合），零生产 MySQL 压力
// 最高在线/活跃账号为折线，新增注册/封禁为柱状，账号规模累计线走右轴（快照起点前不可考，见空档）

interface Row {
  date: string;
  newAccounts: number;
  activeAccounts: number | null;
  peakOnline: number | null;
  bans: number;
  total: number;
}

const SERIES = [
  { key: 'peakOnline', label: '最高在线', color: '#3b82f6' },
  { key: 'activeAccounts', label: '活跃账号', color: '#8b5cf6' },
  { key: 'total', label: '累计账号', color: '#f59e0b' },
  { key: 'newAccounts', label: '新增注册', color: '#10b981' },
  { key: 'bans', label: '新增封禁', color: '#ef4444' },
] as const;

type SeriesKey = (typeof SERIES)[number]['key'];

const RANGES = [7, 30, 90];

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey?: string | number; value?: number | string | null; color?: string }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md">
      <p className="text-sm font-medium text-popover-foreground">{label}</p>
      <div className="mt-1 space-y-0.5">
        {payload.map((item) => {
          const meta = SERIES.find((s) => s.key === item.dataKey);
          if (!meta) return null;
          return (
            <div key={String(item.dataKey)} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: item.color }} />
              <span className="text-muted-foreground">{meta.label}</span>
              <span className="ml-auto pl-3 font-medium tabular-nums text-popover-foreground">
                {item.value ?? '—'}
              </span>
            </div>
          );
        })}
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

export default function OperationTrendChart() {
  const [range, setRange] = useState(30);
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());
  const { data, isLoading } = useDashboardTrends(range);

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const totalByDate = new Map(data.cumulative.points.map((p) => [p.date, p.total]));
    return data.series.map((s) => ({ ...s, total: totalByDate.get(s.date) ?? 0 }));
  }, [data]);

  const toggle = (key: SeriesKey) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="text-sm font-medium">运营趋势</h2>
        <div className="flex items-center gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {SERIES.map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => toggle(key)}
                className={cn(
                  'flex items-center gap-1.5 text-xs transition-opacity',
                  hidden.has(key) ? 'opacity-35' : 'opacity-100',
                )}
                title={hidden.has(key) ? `显示 ${label}` : `隐藏 ${label}`}
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-muted-foreground">{label}</span>
              </button>
            ))}
          </div>
          <div className="flex rounded-md border border-border overflow-hidden shrink-0">
            {RANGES.map((d) => (
              <button
                key={d}
                onClick={() => setRange(d)}
                className={cn(
                  'px-2.5 py-1 text-xs transition-colors',
                  range === d
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {d}天
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 256 }}>
            <ComposedChart data={rows} margin={{ top: 5, right: 5, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                tick={<DateTick />}
                height={24}
                minTickGap={28}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <Tooltip content={<TrendTooltip />} cursor={{ fill: 'hsl(var(--accent))', opacity: 0.4 }} />
              <Bar yAxisId="left" dataKey="newAccounts" fill="#10b981" fillOpacity={0.75} radius={[2, 2, 0, 0]} hide={hidden.has('newAccounts')} maxBarSize={12} />
              <Bar yAxisId="left" dataKey="bans" fill="#ef4444" fillOpacity={0.75} radius={[2, 2, 0, 0]} hide={hidden.has('bans')} maxBarSize={12} />
              <Line yAxisId="left" type="monotone" dataKey="peakOnline" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls={false} hide={hidden.has('peakOnline')} />
              <Line yAxisId="left" type="monotone" dataKey="activeAccounts" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls={false} hide={hidden.has('activeAccounts')} />
              <Line yAxisId="right" type="monotone" dataKey="total" stroke="#f59e0b" strokeWidth={2} dot={false} hide={hidden.has('total')} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
