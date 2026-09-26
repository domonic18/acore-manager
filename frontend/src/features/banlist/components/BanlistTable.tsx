import { useNavigate } from 'react-router-dom';
import type { BanlistItem } from '@/features/banlist/api/banlist.api';
import { SimpleTable, type SimpleColumn } from '@/shared/components/SimpleTable';

interface BanlistTableProps {
  rows: BanlistItem[];
  loading: boolean;
}

export function BanlistTable({ rows, loading }: BanlistTableProps) {
  const navigate = useNavigate();

  const columns: SimpleColumn<BanlistItem>[] = [
    {
      key: 'banType',
      header: '类型',
      render: (ban) => (
        <span
          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
            ban.banType === 'account'
              ? 'bg-red-500/20 text-red-400'
              : 'bg-orange-500/20 text-orange-400'
          }`}
        >
          {ban.banType === 'account' ? '账号' : '角色'}
        </span>
      ),
    },
    {
      key: 'username',
      header: '账号',
      render: (ban) => (
        <button
          onClick={() => navigate(`/accounts/${ban.accountId}`)}
          className="font-medium text-primary hover:underline"
        >
          {ban.username}
        </button>
      ),
    },
    {
      key: 'characters',
      header: '角色',
      render: (ban) =>
        ban.characterNames ? (
          <div className="flex flex-wrap gap-1">
            {ban.characterNames.split(',').map((name) => (
              <span
                key={name}
                className="inline-flex items-center rounded-md bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
              >
                {name}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    {
      key: 'lastIp',
      header: '最后IP',
      render: (ban) => <span className="text-muted-foreground font-mono text-xs">{ban.lastIp || '-'}</span>,
    },
    {
      key: 'banReason',
      header: '封禁原因',
      render: (ban) => (
        <span className="block max-w-[200px] truncate text-muted-foreground" title={ban.banReason}>
          {ban.banReason || '-'}
        </span>
      ),
    },
    {
      key: 'banDate',
      header: '封禁时间',
      render: (ban) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {new Date(ban.banDate).toLocaleString('zh-CN')}
        </span>
      ),
    },
    {
      key: 'unbanDate',
      header: '解封时间',
      render: (ban) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {new Date(ban.banDate).getTime() === new Date(ban.unbanDate).getTime() ? (
            <span className="text-red-400">永久</span>
          ) : (
            new Date(ban.unbanDate).toLocaleString('zh-CN')
          )}
        </span>
      ),
    },
    {
      key: 'bannedBy',
      header: '操作人',
      render: (ban) => <span className="text-muted-foreground">{ban.bannedBy || '-'}</span>,
    },
  ];

  return (
    <SimpleTable
      columns={columns}
      rows={rows}
      rowKey={(ban) => `${ban.accountId}-${ban.banDate}-${ban.banType}`}
      loading={loading}
      emptyText="暂无被封禁的账号或角色"
    />
  );
}
