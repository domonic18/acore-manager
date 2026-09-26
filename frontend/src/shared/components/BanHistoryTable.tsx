import { InfoCard } from '@/shared/components/InfoCard';
import { SimpleTable, type SimpleColumn } from '@/shared/components/SimpleTable';
import { StatusBadge } from '@/shared/components/StatusBadge';

// 账号/角色封禁记录共用的行结构（account.BanRecord / character.CharacterBanRecord 同形）
export interface BanHistoryRow {
  banDate: Date;
  unbanDate: Date;
  bannedBy: string;
  banReason: string;
  active: number;
}

const columns: SimpleColumn<BanHistoryRow>[] = [
  {
    key: 'banDate',
    header: '封禁时间',
    render: (b) => new Date(b.banDate).toLocaleString('zh-CN'),
  },
  {
    key: 'unbanDate',
    header: '解封时间',
    render: (b) =>
      new Date(b.banDate).getTime() === new Date(b.unbanDate).getTime() ? (
        <StatusBadge tone="red">永久</StatusBadge>
      ) : (
        new Date(b.unbanDate).toLocaleString('zh-CN')
      ),
  },
  { key: 'bannedBy', header: '操作人', render: (b) => b.bannedBy },
  { key: 'banReason', header: '原因', render: (b) => b.banReason },
  {
    key: 'active',
    header: '状态',
    render: (b) =>
      b.active ? <StatusBadge tone="red">生效中</StatusBadge> : <StatusBadge tone="green">已解除</StatusBadge>,
  },
];

export function BanHistoryTable({ bans }: { bans?: BanHistoryRow[] }) {
  if (!bans || bans.length === 0) return null;
  return (
    <InfoCard title="封禁记录">
      <SimpleTable dense columns={columns} rows={bans} rowKey={(_, i) => i} />
    </InfoCard>
  );
}
