import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { RACE_MAP, CLASS_MAP, getRaceIconUrl, getClassIconUrl } from '@/shared/constants/game';
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

function IconTick(props: { x?: number; y?: number; payload?: { value: string }; type?: 'race' | 'class' }) {
  const { x = 0, y = 0, payload, type = 'race' } = props;
  const id = parseInt(payload?.value || '0', 10);
  const map = type === 'race' ? RACE_MAP : CLASS_MAP;
  const iconUrl = type === 'race' ? getRaceIconUrl(id) : getClassIconUrl(id);
  const name = map[id]?.name || `${type === 'race' ? '种族' : '职业'} ${id}`;
  const absUrl = typeof window !== 'undefined' ? `${window.location.origin}${iconUrl}` : iconUrl;

  return (
    <g transform={`translate(${x},${y})`}>
      <image
        href={absUrl}
        x={-12}
        y={-28}
        width={24}
        height={24}
        preserveAspectRatio="xMidYMid meet"
      />
      <text
        x={0}
        y={10}
        textAnchor="middle"
        fill="hsl(var(--muted-foreground))"
        fontSize={11}
      >
        {name}
      </text>
    </g>
  );
}

function LevelTick(props: { x?: number; y?: number; payload?: { value: string } }) {
  return (
    <text
      x={props.x || 0}
      y={(props.y || 0) + 12}
      textAnchor="middle"
      fill="hsl(var(--muted-foreground))"
      fontSize={10}
    >
      {props.payload?.value}
    </text>
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
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-6 animate-pulse">
            <div className="h-4 bg-muted rounded w-1/3 mb-4" />
            <div className="h-64 bg-muted rounded" />
          </div>
        ))}
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

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">角色总数</p>
        <p className="text-3xl font-bold mt-2">{totalCharacters}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Level Distribution */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="text-sm font-medium mb-4">等级分布</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={levelData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="level"
                  tick={<LevelTick />}
                  interval={0}
                  height={30}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip content={<CustomTooltip />} contentStyle={{ background: 'transparent', border: 'none', padding: 0 }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Race Distribution */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="text-sm font-medium mb-4">种族分布</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={raceData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="id"
                  tick={<IconTick type="race" />}
                  interval={0}
                  height={60}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip content={<CustomTooltip />} contentStyle={{ background: 'transparent', border: 'none', padding: 0 }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {raceData.map((entry, index) => (
                    <Cell key={`cell-race-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Class Distribution */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="text-sm font-medium mb-4">职业分布</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="id"
                  tick={<IconTick type="class" />}
                  interval={0}
                  height={60}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip content={<CustomTooltip />} contentStyle={{ background: 'transparent', border: 'none', padding: 0 }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {classData.map((entry, index) => (
                    <Cell key={`cell-class-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
