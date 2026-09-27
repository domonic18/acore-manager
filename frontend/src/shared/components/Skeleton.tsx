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
