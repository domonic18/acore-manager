import { Skeleton } from '@/shared/components/Skeleton';
import type { HealthDetail, RealmStatus } from '../api/dashboard.api';

// L1 服务器运行状态：每个 realm 一张子卡（峰值/运行时长/版本），旁边一张平台健康子卡
// realm 数据来自 dashboard stats（60s 缓存），健康灯来自 /api/health/detail（实时轮询）

export function formatUptime(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}天${hours}小时`;
  if (hours > 0) return `${hours}小时${minutes}分`;
  return `${minutes}分`;
}

function StatusDot({ ok }: { ok: boolean | undefined }) {
  const tone =
    ok === undefined
      ? 'bg-muted-foreground/40'
      : ok
        ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]'
        : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]';
  return <span className={`h-2 w-2 rounded-full shrink-0 ${tone}`} />;
}

function MetricItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium tabular-nums truncate">{value}</div>
    </div>
  );
}

function RealmCard({ realm }: { realm: RealmStatus }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-4 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <StatusDot ok={realm.uptimeSeconds > 0 ? true : undefined} />
        <span className="text-sm font-semibold truncate">{realm.name || `Realm ${realm.realmId}`}</span>
        <span className="ml-auto text-[10px] text-muted-foreground shrink-0">ID {realm.realmId}</span>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl font-bold tabular-nums leading-none">{realm.maxPlayers}</span>
        <span className="text-xs text-muted-foreground">峰值在线</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MetricItem label="已运行" value={formatUptime(realm.uptimeSeconds)} />
        <MetricItem
          label="版本"
          value={
            <span className="block truncate align-bottom" title={realm.revision}>
              {realm.revision ? `rev. ${realm.revision.slice(0, 12)}` : '—'}
            </span>
          }
        />
      </div>
    </div>
  );
}

const DEPENDENCIES: { key: keyof NonNullable<HealthDetail>['dependencies']; label: string }[] = [
  { key: 'authDb', label: 'Auth 库' },
  { key: 'charactersDb', label: 'Characters 库' },
  { key: 'worldDb', label: 'World 库' },
  { key: 'acmDb', label: 'ACM 库' },
  { key: 'redis', label: 'Redis' },
];

function PlatformHealthCard({ health }: { health?: HealthDetail }) {
  const deps = DEPENDENCIES.map(({ key, label }) => ({ key, label, ok: health?.dependencies?.[key] }));
  const apiOk = health ? health.state === 'ready' : undefined;
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-4 min-w-0 flex flex-col">
      <div className="text-xs font-medium text-muted-foreground mb-3">平台健康</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {deps.map(({ key, label, ok }) => (
          <span key={key} className="flex items-center gap-1.5 min-w-0">
            <StatusDot ok={ok} />
            <span className="text-xs text-muted-foreground truncate">{label}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5 min-w-0">
          <StatusDot ok={apiOk} />
          <span className="text-xs text-muted-foreground truncate">API {health?.state ?? '…'}</span>
        </span>
      </div>
      <div className="mt-auto pt-3 text-xs text-muted-foreground">
        进程运行 {health ? formatUptime(health.uptimeSeconds) : '—'}
      </div>
    </div>
  );
}

interface ServerStatusCardProps {
  realms: RealmStatus[];
  health?: HealthDetail;
  loading?: boolean;
}

export default function ServerStatusCard({ realms, health, loading = false }: ServerStatusCardProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Skeleton className="h-[132px] rounded-lg" />
        <Skeleton className="h-[132px] rounded-lg hidden md:block" />
        <Skeleton className="h-[132px] rounded-lg hidden xl:block" />
      </div>
    );
  }

  const hasRealms = realms.length > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {hasRealms ? (
        realms.map((realm) => <RealmCard key={realm.realmId} realm={realm} />)
      ) : (
        <div className="rounded-md border border-border/60 bg-muted/20 p-4 flex items-center justify-center text-sm text-muted-foreground">
          服务器无启动记录
        </div>
      )}
      <PlatformHealthCard health={health} />
    </div>
  );
}
