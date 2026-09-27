import { useNavigate } from 'react-router-dom';
import { useMuteList } from '@/features/mute/hooks/useMute';
import type { MuteRecord } from '@/features/mute/api/mute.api';
import { SimpleTable, type SimpleColumn } from '@/shared/components/SimpleTable';

export default function MuteListPage() {
  const navigate = useNavigate();
  const { data: mutes, isLoading } = useMuteList();

  const columns: SimpleColumn<MuteRecord>[] = [
    {
      key: 'username',
      header: '账号',
      render: (mute) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/accounts/${mute.accountId}`);
          }}
          className="font-medium text-primary hover:underline"
        >
          {mute.username}
        </button>
      ),
    },
    {
      key: 'characters',
      header: '角色',
      render: (mute) =>
        mute.characterNames ? (
          <div className="flex flex-wrap gap-1">
            {mute.characterNames.split(',').map((name) => (
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
      render: (mute) => <span className="text-muted-foreground font-mono text-xs">{mute.lastIp || '-'}</span>,
    },
    {
      key: 'reason',
      header: '禁言原因',
      className: 'max-w-[200px] truncate',
      render: (mute) => <span title={mute.muteReason}>{mute.muteReason || '-'}</span>,
    },
    {
      key: 'muteTime',
      header: '到期时间',
      render: (mute) => (
        <span className="text-muted-foreground whitespace-nowrap">
          {mute.muteTime?.startsWith('下次登录生效')
            ? mute.muteTime
            : mute.muteTime
              ? new Date(mute.muteTime).toLocaleString('zh-CN')
              : '-'}
        </span>
      ),
    },
    {
      key: 'mutedBy',
      header: '操作人',
      render: (mute) => <span className="text-muted-foreground">{mute.mutedBy || '-'}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">禁言列表</h1>
      <SimpleTable
        columns={columns}
        rows={mutes ?? []}
        rowKey={(mute, index) => `${mute.accountId}-${index}`}
        loading={isLoading}
        emptyText="暂无被禁言的账号"
      />
    </div>
  );
}
