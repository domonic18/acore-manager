import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { useTargetedList } from '../hooks/useTargetedAnalysis';

// 定向分析历史列表（T4.6）：分页表格 + 角色名/账号名搜索，行点击跳转整页详情（可新标签打开）。

const PAGE_SIZE = 20;

export const STATUS_STYLE: Record<string, string> = {
  ok: 'bg-green-500/20 text-green-400',
  running: 'bg-sky-500/20 text-sky-400',
  failed: 'bg-red-500/20 text-red-400',
};

export const STATUS_LABEL: Record<string, string> = { ok: '已完成', running: '分析中', failed: '失败' };

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

export function TargetedHistoryList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading, isError } = useTargetedList(page, search || undefined);
  const items = data ?? [];
  const hasNext = items.length === PAGE_SIZE;

  const submitSearch = (): void => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-medium">分析历史</h2>
        <div className="ml-auto flex gap-2">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
            placeholder="按角色名/账号名搜索"
            className="w-48 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={submitSearch}
            className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
          >
            <Search className="h-3.5 w-3.5" /> 搜索
          </button>
        </div>
      </div>

      {isError ? (
        <div className="py-6 text-center text-sm text-destructive">历史加载失败</div>
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
        </div>
      ) : items.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">暂无分析记录</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">对象</th>
                <th className="px-3 py-2 font-medium">服务器</th>
                <th className="px-3 py-2 font-medium">时间范围</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">触发人</th>
                <th className="px-3 py-2 font-medium">发起时间</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => navigate(`/ai-diagnosis/targeted/${item.id}`)}
                  className="cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/50"
                >
                  <td className="px-3 py-2 font-mono text-muted-foreground">#{item.id}</td>
                  <td className="px-3 py-2">
                    <Link
                      to={`/ai-diagnosis/targeted/${item.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-primary hover:underline"
                    >
                      <span className="mr-2 rounded bg-accent/60 px-1.5 py-0.5 text-xs text-muted-foreground">
                        {item.subjectType === 'character' ? '角色' : '账号'}
                      </span>
                      {item.subjectName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{item.realm}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {item.timeFrom} ~ {item.timeTo}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[item.status] ?? 'bg-accent'}`}>
                      {STATUS_LABEL[item.status] ?? item.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{item.triggeredBy}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{formatTime(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(page > 1 || hasNext) && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-muted-foreground disabled:opacity-40 hover:bg-accent"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> 上一页
          </button>
          <span className="text-muted-foreground">第 {page} 页</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!hasNext}
            className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-muted-foreground disabled:opacity-40 hover:bg-accent"
          >
            下一页 <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
