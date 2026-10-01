import { InfoCard } from '@/shared/components/InfoCard';
import { SimpleTable, type SimpleColumn } from '@/shared/components/SimpleTable';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { raceMap, classMap } from '@/shared/constants/game.constants';
import type { AccountCharacter } from '@/features/account/api/account.api';

const columns: SimpleColumn<AccountCharacter>[] = [
  { key: 'name', header: '名称', render: (c) => <span className="font-medium">{c.name}</span> },
  { key: 'level', header: '等级', render: (c) => c.level },
  { key: 'race', header: '种族', render: (c) => raceMap[c.race] || '未知' },
  { key: 'class', header: '职业', render: (c) => classMap[c.class] || '未知' },
  {
    key: 'online',
    header: '状态',
    render: (c) =>
      c.online ? <StatusBadge tone="green">在线</StatusBadge> : <StatusBadge>离线</StatusBadge>,
  },
];

interface AccountCharactersTableProps {
  characters?: AccountCharacter[];
  loading?: boolean;
  onRowClick: (character: AccountCharacter) => void;
}

export function AccountCharactersTable({ characters, loading, onRowClick }: AccountCharactersTableProps) {
  return (
    <InfoCard title="角色列表">
      <SimpleTable
        dense
        columns={columns}
        rows={characters ?? []}
        rowKey={(c) => c.guid}
        loading={loading}
        emptyText="该账号下暂无角色"
        onRowClick={onRowClick}
      />
    </InfoCard>
  );
}
