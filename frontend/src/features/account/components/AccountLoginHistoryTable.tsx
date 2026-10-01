import { InfoCard } from '@/shared/components/InfoCard';
import { SimpleTable, type SimpleColumn } from '@/shared/components/SimpleTable';

export interface LoginHistoryRecord {
  ip: string;
  time: Date;
  action: string;
  comment?: string;
}

const columns: SimpleColumn<LoginHistoryRecord>[] = [
  { key: 'time', header: '时间', render: (r) => new Date(r.time).toLocaleString('zh-CN') },
  { key: 'ip', header: 'IP', render: (r) => <span className="font-mono text-xs">{r.ip}</span> },
  { key: 'action', header: '动作', render: (r) => r.action },
  { key: 'comment', header: '备注', render: (r) => r.comment || '-' },
];

interface AccountLoginHistoryTableProps {
  history?: LoginHistoryRecord[];
  loading?: boolean;
}

export function AccountLoginHistoryTable({ history, loading }: AccountLoginHistoryTableProps) {
  if (!history || history.length === 0) return null;
  return (
    <InfoCard title="登录历史">
      <SimpleTable dense columns={columns} rows={history} rowKey={(_, i) => i} loading={loading} />
    </InfoCard>
  );
}
