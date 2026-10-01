import { Skeleton } from '@/shared/components/Skeleton';

interface PaginationBarProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  /** 首次加载时渲染同构骨架条，避免记录数/分页按钮就绪后布局跳动 */
  loading?: boolean;
}

export function PaginationBar({ page, totalPages, total, onPageChange, loading = false }: PaginationBarProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-between" aria-busy="true" aria-label="分页加载中">
        <Skeleton className="h-5 w-20" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-16" />
        </div>
      </div>
    );
  }
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">共 {total} 条记录</p>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="px-3 py-1.5 rounded-md border border-border text-sm disabled:opacity-50 hover:bg-accent"
        >
          上一页
        </button>
        <span className="px-3 py-1.5 text-sm text-muted-foreground">
          第 {page} / {totalPages} 页
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="px-3 py-1.5 rounded-md border border-border text-sm disabled:opacity-50 hover:bg-accent"
        >
          下一页
        </button>
      </div>
    </div>
  );
}
