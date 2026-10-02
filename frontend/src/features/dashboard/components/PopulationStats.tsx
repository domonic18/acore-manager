import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { RACE_MAP, CLASS_MAP, getRaceIconUrl, getClassIconUrl } from '@/shared/constants/game';
import { Skeleton, ChartCardSkeleton } from '@/shared/components/Skeleton';
import type { DistributionItem } from '../api/dashboard.api';

interface TooltipPayloadItem {
  payload?: {
    name?: string;
    count?: number;
    level?: string;
  };
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  if (!data) return null;

  const label = data.name || `${data.level}级`;
  const value = data.count ?? 0;

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md">
      <p className="text-sm font-medium text-popover-foreground">{label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">数量: {value}</p>
    </div>
  );
}

interface PopulationStatsProps {
  totalCharacters: number;
  levelDistribution: DistributionItem[];
  raceDistribution: DistributionItem[];
  classDistribution: DistributionItem[];
  loading?: boolean;
}

// 图标刻度：仅图标无文字（名称在 tooltip 中展示），压缩 XAxis 高度
function IconTick(props: { x?: number; y?: number; payload?: { value: string }; type?: 'race' | 'class' }) {
  const { x = 0, y = 0, payload, type = 'race' } = props;
  const id = parseInt(payload?.value || '0', 10);
  const iconUrl = type === 'race' ? getRaceIconUrl(id) : getClassIconUrl(id);
  const name = (type === 'race' ? RACE_MAP : CLASS_MAP)[id]?.name || '';
  const absUrl = typeof window !== 'undefined' ? `${window.location.origin}${iconUrl}` : iconUrl;

  return (
    <g transform={`translate(${x},${y})`}>
      <title>{name}</title>
      <image href={absUrl} x={-10} y={-2} width={20} height={20} preserveAspectRatio="xMidYMid meet" />
    </g>
  );
}

function LevelTick(props: { x?: number; y?: number; payload?: { value: string } }) {
  return (
    <text
      x={props.x || 0}
      y={(props.y || 0) + 10}
      textAnchor="middle"
      fill="hsl(var(--muted-foreground))"
      fontSize={10}
    >
      {props.payload?.value}
    </text>
  );
}

function ChartBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">{title}</p>
      <div className="h-40">{children}</div>
    </div>
  );
}

export default function PopulationStats({
  totalCharacters,
  levelDistribution,
  raceDistribution,
  classDistribution,
  loading = false,
}: PopulationStatsProps) {
  if (loading) {
    // 骨架与加载完成后的布局同构（单卡头行 + 三张图），避免卡片数变化造成跳动
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-28" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {['等级分布', '种族分布', '职业分布'].map((name) => (
            <ChartCardSkeleton key={name} label={`${name}加载中`} />
          ))}
        </div>
      </div>
    );
  }

  const raceData = raceDistribution.map((item) => ({
    id: item.key,
    name: RACE_MAP[item.key]?.name || `种族 ${item.key}`,
    count: item.count,
    color: RACE_MAP[item.key]?.color || '#94a3b8',
  }));

  const classData = classDistribution.map((item) => ({
    id: item.key,
    name: CLASS_MAP[item.key]?.name || `职业 ${item.key}`,
    count: item.count,
    color: CLASS_MAP[item.key]?.color || '#94a3b8',
  }));

  const levelData = (() => {
    const buckets: Record<string, number> = {};
    levelDistribution.forEach((item) => {
      const level = item.key;
      const bucketStart = Math.floor((level - 1) / 10) * 10 + 1;
      const bucketEnd = bucketStart + 9;
      const label = `${bucketStart}-${bucketEnd}`;
      buckets[label] = (buckets[label] || 0) + item.count;
    });
    return Object.entries(buckets)
      .map(([level, count]) => ({ level, count }))
      .sort((a, b) => parseInt(a.level, 10) - parseInt(b.level, 10));
  })();

  const chartTooltip = <Tooltip content={<CustomTooltip />} contentStyle={{ background: 'transparent', border: 'none', padding: 0 }} />;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-medium">人口结构</h2>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold tabular-nums">{totalCharacters}</span>
          <span className="text-xs text-muted-foreground">角色总数</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartBlock title="等级分布">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 160 }}>
            <BarChart data={levelData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="level"
                tick={<LevelTick />}
                interval={0}
                height={24}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              {chartTooltip}
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartBlock>

        <ChartBlock title="种族分布">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 160 }}>
            <BarChart data={raceData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="id"
                tick={<IconTick type="race" />}
                interval={0}
                height={28}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              {chartTooltip}
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {raceData.map((entry, index) => (
                  <Cell key={`cell-race-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartBlock>

        <ChartBlock title="职业分布">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 160 }}>
            <BarChart data={classData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="id"
                tick={<IconTick type="class" />}
                interval={0}
                height={28}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              {chartTooltip}
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {classData.map((entry, index) => (
                  <Cell key={`cell-class-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartBlock>
      </div>
    </div>
  );
}
