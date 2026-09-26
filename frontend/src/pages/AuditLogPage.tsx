import { useState } from 'react';
import { useAuditLogList } from '@/features/audit-log/hooks/useAuditLog';
import { AuditLogTable } from '@/features/audit-log/components/AuditLogTable';
import { TimeRangeFilter, type TimeRange } from '@/shared/components/TimeRangeFilter';
import { PaginationBar } from '@/shared/components/PaginationBar';

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [operation, setOperation] = useState('');
  const [dateRange, setDateRange] = useState<TimeRange | null>(null);

  const { data, isLoading } = useAuditLogList({
    page,
    pageSize: 20,
    operation: operation || undefined,
    startDate: dateRange?.from,
    endDate: dateRange?.to,
  });

  const handleReset = () => {
    setOperation('');
    setDateRange(null);
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  return (
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
        <TimeRangeFilter
          label="时间范围"
          value={dateRange}
          onChange={(v) => {
            setDateRange(v);
            setPage(1);
          }}
        />
        {(operation || dateRange) && (
          <button onClick={handleReset} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            重置
          </button>
        )}
      </div>

      <AuditLogTable rows={data?.items ?? []} loading={isLoading} />

      <PaginationBar page={page} totalPages={totalPages} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  );
}
