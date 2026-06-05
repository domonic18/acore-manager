import { useState } from 'react';
import { AppLayout } from '@/shared/components/AppLayout';
import { useTransactionList } from '@/features/transaction/hooks/useTransaction';

export function TransactionPage() {
  const [page, setPage] = useState(1);
  const [characterName, setCharacterName] = useState('');
  const [type, setType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data, isLoading } = useTransactionList({
    page,
    pageSize: 20,
    characterName: characterName || undefined,
    type: type ? parseInt(type) : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  return (
    <AppLayout>
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
            <option value="1">邮寄</option>
            <option value="2">交易</option>
            <option value="3">COD</option>
            <option value="4">拍卖行</option>
            <option value="5">公会银行</option>
          </select>
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
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">发送方</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">接收方</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">类型</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">金额</th>
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
                data?.items.map((tx, index) => (
                  <tr key={index} className="border-b border-border hover:bg-accent/50">
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(tx.date).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3">{tx.senderName}</td>
                    <td className="px-4 py-3">{tx.receiverName}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs bg-secondary text-secondary-foreground">
                        {tx.typeLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {tx.amount >= 0 ? (
                        <span className="text-green-400">+{tx.amount}</span>
                      ) : (
                        <span className="text-red-400">{tx.amount}</span>
                      )}
                    </td>
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
