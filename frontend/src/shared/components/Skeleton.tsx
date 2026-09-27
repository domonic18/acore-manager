import type { CSSProperties } from 'react';
import { cn } from '@/shared/lib/utils';

// 全站统一骨架基元：所有加载占位由 animate-pulse bg-muted 块组合而成，
// 页面在数据未就绪时整体渲染骨架、就绪后一次性切换，避免分块弹入造成闪屏

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <div className={cn('animate-pulse rounded bg-muted', className)} style={style} />;
}

// 图表卡片骨架：标题条 + 高图区，与加载完成后 rounded-lg border bg-card p-6 的卡片同构
export function ChartCardSkeleton({ label = '图表加载中' }: { label?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6" aria-busy="true" aria-label={label}>
      <Skeleton className="mb-4 h-4 w-1/3" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

// 详情页整页骨架：返回行 + 标题/操作区 + 信息卡 + 若干表格块，
// 详情页在数据未就绪时整体替换渲染，避免标题与各表格随请求先后弹入
export function DetailPageSkeleton({
  infoRows = 8,
  tables = 2,
}: {
  infoRows?: number;
  tables?: number;
}) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="页面加载中">
      <Skeleton className="h-4 w-20" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      {infoRows > 0 && (
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
            {Array.from({ length: infoRows }, (_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </div>
      )}
      {Array.from({ length: tables }, (_, t) => (
        <div key={t} className="rounded-lg border border-border">
          <div className="border-b border-border bg-card px-4 py-3">
            <Skeleton className="h-4 w-24" />
          </div>
          {Array.from({ length: 4 }, (_, r) => (
            <div key={r} className="flex gap-6 border-b border-border px-4 py-3">
              {[18, 22, 15, 25].map((w, c) => (
                <Skeleton key={c} className="h-4" style={{ width: `${w}%` }} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
