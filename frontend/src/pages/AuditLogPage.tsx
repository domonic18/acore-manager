import { useState } from 'react';
import { AppLayout } from '@/shared/components/AppLayout';
import { useAuditLogList } from '@/features/audit-log/hooks/useAuditLog';

export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [operation, setOperation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data, isLoading } = useAuditLogList({
    page,
    pageSize: 20,
    operation: operation || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">日志审计</h1>

        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={operation}
            onChange={(e) => setOperation(e.target.value)}
            placeholder="操作类型"
            className="px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">时间</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">操作人</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">操作</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">目标</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">详情</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    加载中...
                  </td>
                </tr>
              ) : data?.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    暂无数据
                  </td>
                </tr>
              ) : (
                data?.items.map((log) => (
                  <tr key={log.id} className="border-b border-border hover:bg-accent/50">
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">{log.operatorName}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs bg-secondary text-secondary-foreground">
                        {log.operation}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{log.target || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{log.details || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">共 {data?.total} 条记录</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-md border border-border text-sm disabled:opacity-50 hover:bg-accent"
              >
                上一页
              </button>
              <span className="px-3 py-1.5 text-sm text-muted-foreground">
                第 {page} / {totalPages} 页
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-md border border-border text-sm disabled:opacity-50 hover:bg-accent"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
