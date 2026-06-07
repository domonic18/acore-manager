import { useState } from 'react';
import { useTransactionList } from '@/features/transaction/hooks/useTransaction';
import { formatGold } from '@/shared/utils/gold.util';
import { Dialog } from '@/shared/components/Dialog';
import { HelpCircle } from 'lucide-react';

const typeDescriptions: Record<number, string> = {
  1: '货到付款 - 收取货到付款邮件时支付的金币',
  2: '拍卖行 - 拍卖成交时记录的成交金额',
  3: '公会银行存款 - 向公会银行存入金币',
  4: '公会银行取款 - 从公会银行取出金币（含修理费）',
  5: '邮寄 - 发送附带金币的邮件',
  6: '交易 - 与其他玩家直接交易的金币',
};

function factionBadge(faction: 'alliance' | 'horde' | null) {
  if (faction === 'alliance') {
    return <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-400">联盟</span>;
  }
  if (faction === 'horde') {
    return <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/15 text-red-400">部落</span>;
  }
  return <span className="text-muted-foreground text-xs">—</span>;
}

function levelBadge(level: number | null) {
  if (level === null) return <span className="text-muted-foreground text-xs">—</span>;
  return <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-400">Lv.{level}</span>;
}

export default function TransactionPage() {
  const [page, setPage] = useState(1);
  const [characterName, setCharacterName] = useState('');
  const [type, setType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showTypeHelp, setShowTypeHelp] = useState(false);

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
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">阵营</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">级别</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  类型
                  <button
                    onClick={() => setShowTypeHelp(true)}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    title="点击查看类型说明"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </span>
              </th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">金额</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  加载中...
                </td>
              </tr>
            ) : data?.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
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
                  <td className="px-4 py-3 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">发:</span>
                      {factionBadge(tx.senderFaction)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">收:</span>
                      {factionBadge(tx.receiverFaction)}
                    </div>
                  </td>
                  <td className="px-4 py-3 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">发:</span>
                      {levelBadge(tx.senderLevel)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">收:</span>
                      {levelBadge(tx.receiverLevel)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded text-xs bg-secondary text-secondary-foreground">
                      {tx.typeLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span className="text-amber-400">{formatGold(tx.amount)}</span>
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

      <Dialog
        open={showTypeHelp}
        onClose={() => setShowTypeHelp(false)}
        title="交易类型说明"
        footer={
          <button
            onClick={() => setShowTypeHelp(false)}
            className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
          >
            关闭
          </button>
        }
      >
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {Object.entries(typeDescriptions).map(([typeNum, desc]) => (
            <div key={typeNum} className="flex gap-2 text-sm">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-secondary text-xs font-medium shrink-0">
                {typeNum}
              </span>
              <span className="text-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
      </Dialog>
    </div>
  );
}
