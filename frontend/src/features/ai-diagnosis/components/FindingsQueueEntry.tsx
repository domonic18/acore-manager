import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { usePatrolFindings } from '../hooks/usePatrolFindings';

// 巡检主页常驻待处置入口：跨天待办独立于日期视图，点击进入违规巡检队列页
export function FindingsQueueEntry() {
  const { data, isLoading } = usePatrolFindings({ status: 'open', page: 1, pageSize: 1 });
  const total = data?.total ?? 0;
  return (
    <Link
      to="/ai-diagnosis/findings"
      className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm transition-colors hover:bg-accent"
    >
      <span className="font-medium">违规巡检队列</span>
      {isLoading ? (
        <span className="text-xs text-muted-foreground">统计中…</span>
      ) : total > 0 ? (
        <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-400">待处置 {total}</span>
      ) : (
        <span className="text-xs text-muted-foreground">暂无待处置</span>
      )}
      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
