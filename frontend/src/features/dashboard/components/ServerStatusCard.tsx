import type { ReactNode } from 'react';
import { Skeleton } from '@/shared/components/Skeleton';
import type { HealthDetail, RealmStatus } from '../api/dashboard.api';

// L1 服务器运行状态卡：realm 启动信息（峰值/运行时长/版本）+ 依赖健康灯 + API 进程状态
// realm 数据来自 dashboard stats（60s 缓存），健康灯来自 /api/health/detail（实时轮询）

export function formatUptime(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}天${hours}小时`;
  if (hours > 0) return `${hours}小时${minutes}分`;
  return `${minutes}分`;
}

function Divider() {
  return <div className="hidden lg:block self-stretch w-px bg-border" />;
}

function Section({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-8 px-4 first:pl-0 last:pr-0 py-1">{children}</div>;
}

function MetricLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
    </div>
  );
}

function HealthDot({ ok, label }: { ok: boolean | undefined; label: string }) {
  const tone =
    ok === undefined
      ? 'bg-muted-foreground/40'
      : ok
        ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]'
        : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]';
  return (
    <span className="flex items-center gap-1.5" title={label}>
      <span className={`h-2 w-2 rounded-full shrink-0 ${tone}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

interface ServerStatusCardProps {
  realms: RealmStatus[];
  health?: HealthDetail;
  loading?: boolean;
}

const DEPENDENCIES: { key: keyof NonNullable<ServerStatusCardProps['health']>['dependencies']; label: string }[] = [
  { key: 'authDb', label: 'Auth 库' },
  { key: 'charactersDb', label: 'Characters 库' },
  { key: 'worldDb', label: 'World 库' },
  { key: 'acmDb', label: 'ACM 库' },
  { key: 'redis', label: 'Redis' },
];

export default function ServerStatusCard({ realms, health, loading = false }: ServerStatusCardProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card px-5 py-4">
        <div className="flex flex-wrap items-center gap-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-y-3">
        {realms.length === 0 ? (
          <Section>
            <span className="text-sm text-muted-foreground">服务器无启动记录</span>
          </Section>
        ) : (
          realms.map((realm) => (
            <Section key={realm.realmId}>
              <div className="space-y-1 min-w-52">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                  <span className="text-sm font-medium">{realm.name || `Realm ${realm.realmId}`}</span>
                </div>
                <div className="space-y-0.5">
                  <MetricLine label="峰值在线" value={realm.maxPlayers} />
                  <MetricLine label="已运行" value={formatUptime(realm.uptimeSeconds)} />
                  <MetricLine
                    label="版本"
                    value={
                      <span className="max-w-44 truncate inline-block align-bottom" title={realm.revision}>
                        {realm.revision || '—'}
                      </span>
                    }
                  />
                </div>
              </div>
            </Section>
          ))
        )}

        <Divider />

        <Section>
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">依赖健康</span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {DEPENDENCIES.map(({ key, label }) => (
                <HealthDot key={key} ok={health?.dependencies?.[key]} label={label} />
              ))}
            </div>
          </div>
        </Section>

        <Divider />

        <Section>
          <div className="space-y-1 min-w-32">
            <div className="flex items-center gap-2">
              <HealthDot ok={health?.state ? health.state === 'ready' : undefined} label="API" />
              <span className="text-sm font-medium">API 服务</span>
            </div>
            <div className="space-y-0.5">
              <MetricLine label="状态" value={health?.state ?? '—'} />
              <MetricLine label="进程运行" value={health ? formatUptime(health.uptimeSeconds) : '—'} />
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
