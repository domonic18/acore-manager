import { useNavigate } from 'react-router-dom';
import type { CharacterListItem } from '@/features/character/api/character.api';
import { raceMap, classMap } from '@/shared/constants/game.constants';
import { SimpleTable, type SimpleColumn } from '@/shared/components/SimpleTable';

interface CharacterTableProps {
  rows: CharacterListItem[];
  loading: boolean;
}

export function CharacterTable({ rows, loading }: CharacterTableProps) {
  const navigate = useNavigate();
  const isDeleted = (char: CharacterListItem) => !char.name;

  const columns: SimpleColumn<CharacterListItem>[] = [
    {
      key: 'name',
      header: '名称',
      className: 'whitespace-nowrap',
      render: (char) =>
        isDeleted(char) ? (
          <span className="text-muted-foreground line-through italic">
            已删除（GUID: {char.guid}）
          </span>
        ) : (
          char.name
        ),
    },
    {
      key: 'account',
      header: '所属账号',
      className: 'whitespace-nowrap',
      render: (char) =>
        isDeleted(char) ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <button
            className="text-primary hover:underline text-sm"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/accounts/${char.accountId}`);
            }}
          >
            {char.accountUsername}
          </button>
        ),
    },
    { key: 'level', header: '等级', className: 'whitespace-nowrap', render: (char) => char.level },
    {
      key: 'race',
      header: '种族',
      className: 'whitespace-nowrap',
      render: (char) => <span className="text-muted-foreground">{raceMap[char.race] || '未知'}</span>,
    },
    {
      key: 'class',
      header: '职业',
      className: 'whitespace-nowrap',
      render: (char) => <span className="text-muted-foreground">{classMap[char.class] || '未知'}</span>,
    },
    {
      key: 'status',
      header: '状态',
      className: 'whitespace-nowrap',
      render: (char) =>
        isDeleted(char) ? (
          <span className="text-red-400 text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30">已删除</span>
        ) : char.online ? (
          <span className="text-green-400">在线</span>
        ) : (
          <span className="text-muted-foreground">离线</span>
        ),
    },
  ];

  return (
    <SimpleTable
      columns={columns}
      rows={rows}
      rowKey={(char) => char.guid}
      onRowClick={(char) => {
        if (!isDeleted(char)) {
          navigate(`/characters/${char.guid}`);
        }
      }}
      loading={loading}
      tableClassName="min-w-[760px]"
      rowClassName={(char) => (isDeleted(char) ? 'bg-red-50/50 dark:bg-red-950/20' : '')}
    />
  );
}
