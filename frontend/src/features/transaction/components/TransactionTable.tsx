import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import type { TransactionRecord } from '@/features/transaction/api/transaction.api';
import { formatGold } from '@/shared/utils/gold.util';
import { Dialog } from '@/shared/components/Dialog';
import { SimpleTable, type SimpleColumn } from '@/shared/components/SimpleTable';

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

function partyCell(name: string, level: number | null, faction: 'alliance' | 'horde' | null) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span>{name}</span>
      {level !== null && levelBadge(level)}
      {faction !== null && factionBadge(faction)}
    </div>
  );
}

interface TransactionTableProps {
  rows: TransactionRecord[];
  loading: boolean;
}

export function TransactionTable({ rows, loading }: TransactionTableProps) {
  const [showTypeHelp, setShowTypeHelp] = useState(false);

  const columns: SimpleColumn<TransactionRecord>[] = [
    {
      key: 'date',
      header: '时间',
      render: (tx) => <span className="text-muted-foreground">{new Date(tx.date).toLocaleString('zh-CN')}</span>,
    },
    {
      key: 'sender',
      header: '发送方',
      render: (tx) => partyCell(tx.senderName, tx.senderLevel, tx.senderFaction),
    },
    {
      key: 'receiver',
      header: '接收方',
      render: (tx) => partyCell(tx.receiverName, tx.receiverLevel, tx.receiverFaction),
    },
    {
      key: 'type',
      header: (
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
      ),
      render: (tx) => (
        <span className="inline-flex px-2 py-0.5 rounded text-xs bg-secondary text-secondary-foreground">
          {tx.typeLabel}
        </span>
      ),
    },
    {
      key: 'amount',
      header: '金额',
      className: 'text-right',
      render: (tx) => (
        <span className="font-mono text-amber-400">{formatGold(tx.amount)}</span>
      ),
    },
  ];

  return (
    <>
      <SimpleTable columns={columns} rows={rows} rowKey={(_, index) => index} loading={loading} />
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
    </>
  );
}
