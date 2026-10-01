import { SimpleTable, type SimpleColumn } from '@/shared/components/SimpleTable';
import { StatusBadge } from '@/shared/components/StatusBadge';

export interface IpBanRow {
  ip: string;
  banDate: Date;
  unbanDate: Date;
  bannedBy: string;
  banReason: string;
}

interface IpBanTableProps {
  rows?: IpBanRow[];
  isLoading?: boolean;
  unbanPending: boolean;
  onUnban: (ip: string) => void;
}

export function IpBanTable({ rows, isLoading, unbanPending, onUnban }: IpBanTableProps) {
  const columns: SimpleColumn<IpBanRow>[] = [
    { key: 'ip', header: 'IP 地址', render: (b) => <span className="font-mono text-xs">{b.ip}</span> },
    {
      key: 'banDate',
      header: '封禁时间',
      render: (b) => <span className="text-muted-foreground">{new Date(b.banDate).toLocaleString('zh-CN')}</span>,
    },
    {
      key: 'unbanDate',
      header: '解封时间',
      render: (b) =>
        new Date(b.banDate).getTime() === new Date(b.unbanDate).getTime() ? (
          <StatusBadge tone="red">永久</StatusBadge>
        ) : (
          <span className="text-muted-foreground">{new Date(b.unbanDate).toLocaleString('zh-CN')}</span>
        ),
    },
    { key: 'bannedBy', header: '操作人', render: (b) => b.bannedBy },
    { key: 'banReason', header: '原因', render: (b) => b.banReason },
    {
      key: 'actions',
      header: '操作',
      className: 'text-right',
      render: (b) => (
        <button
          onClick={() => onUnban(b.ip)}
          disabled={unbanPending}
          className="px-3 py-1 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50"
        >
          解封
        </button>
      ),
    },
  ];

  return (
    <SimpleTable
      columns={columns}
      rows={rows ?? []}
      rowKey={(_, i) => i}
      loading={isLoading}
      emptyText="暂无封禁记录"
    />
  );
}
