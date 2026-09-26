import { useState } from 'react';
import { useTransactionList } from '@/features/transaction/hooks/useTransaction';
import { TransactionTable } from '@/features/transaction/components/TransactionTable';
import { TimeRangeFilter, type TimeRange } from '@/shared/components/TimeRangeFilter';
import { PaginationBar } from '@/shared/components/PaginationBar';

export default function TransactionPage() {
  const [page, setPage] = useState(1);
  const [characterName, setCharacterName] = useState('');
  const [type, setType] = useState('');
  const [dateRange, setDateRange] = useState<TimeRange | null>(null);

  const { data, isLoading } = useTransactionList({
    page,
    pageSize: 20,
    characterName: characterName || undefined,
    type: type ? parseInt(type) : undefined,
    startDate: dateRange?.from,
    endDate: dateRange?.to,
  });

  const handleReset = () => {
    setCharacterName('');
    setType('');
    setDateRange(null);
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">交易记录</h1>

      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={characterName}
          onChange={(e) => setCharacterName(e.target.value)}
          placeholder="角色名"
          className="px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">全部类型</option>
          <option value="1">货到付款</option>
          <option value="2">拍卖行</option>
          <option value="3">公会银行存款</option>
          <option value="4">公会银行取款</option>
          <option value="5">邮寄</option>
          <option value="6">交易</option>
        </select>
        <TimeRangeFilter
          label="时间范围"
          value={dateRange}
          onChange={(v) => {
            setDateRange(v);
            setPage(1);
          }}
        />
        {(characterName || type || dateRange) && (
          <button onClick={handleReset} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            重置
          </button>
        )}
      </div>

      <TransactionTable rows={data?.items ?? []} loading={isLoading} />

      <PaginationBar page={page} totalPages={totalPages} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  );
}
