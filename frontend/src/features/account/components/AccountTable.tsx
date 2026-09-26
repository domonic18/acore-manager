import { ChevronUp, ChevronDown } from 'lucide-react';
import type { AccountListItem } from '@/features/account/api/account.api';

export interface AccountSortState {
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

function SortHeader({
  label,
  field,
  sort,
  onSort,
}: {
  label: string;
  field: string;
  sort: AccountSortState;
  onSort: (field: string) => void;
}) {
  const active = sort.sortBy === field;
  return (
    <th
      className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="inline-flex flex-col">
          <ChevronUp
            size={12}
            className={active && sort.sortOrder === 'ASC' ? 'text-primary' : 'text-muted-foreground/30'}
          />
          <ChevronDown
            size={12}
            className={active && sort.sortOrder === 'DESC' ? 'text-primary' : 'text-muted-foreground/30'}
            style={{ marginTop: '-6px' }}
          />
        </span>
      </span>
    </th>
  );
}

interface AccountTableProps {
  rows: AccountListItem[];
  loading: boolean;
  sort: AccountSortState;
  onSort: (field: string) => void;
  onOpen: (accountId: number) => void;
}

export function AccountTable({ rows, loading, sort, onSort, onOpen }: AccountTableProps) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-card">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">ID</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">用户名</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">邮箱</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">GM等级</th>
            <SortHeader label="角色数" field="characterCount" sort={sort} onSort={onSort} />
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
            <SortHeader label="注册时间" field="joinDate" sort={sort} onSort={onSort} />
            <SortHeader label="最后登录" field="lastLogin" sort={sort} onSort={onSort} />
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">最后IP</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">操作</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                加载中...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                暂无数据
              </td>
            </tr>
          ) : (
            rows.map((account) => (
              <tr
                key={account.id}
                className="border-b border-border hover:bg-accent/50 cursor-pointer"
                onClick={() => onOpen(account.id)}
              >
                <td className="px-4 py-3">{account.id}</td>
                <td className="px-4 py-3 font-medium">{account.username}</td>
                <td className="px-4 py-3 text-muted-foreground">{account.email || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs ${
                    account.gmlevel >= 3
                      ? 'bg-red-500/20 text-red-400'
                      : account.gmlevel >= 2
                      ? 'bg-yellow-500/20 text-yellow-400'
                      : account.gmlevel >= 1
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {account.gmlevel || '玩家'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {account.characterCount > 0 ? (
                    <span className="text-primary font-medium">{account.characterCount}</span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {account.online ? (
                    <span className="text-green-400">在线</span>
                  ) : (
                    <span className="text-muted-foreground">离线</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {account.joinDate ? new Date(account.joinDate).toLocaleDateString('zh-CN') : '-'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {account.lastLogin
                    ? new Date(account.lastLogin).toLocaleString('zh-CN')
                    : '-'}
                </td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                  {account.lastIp || '-'}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(account.id);
                    }}
                    className="text-primary text-sm hover:underline"
                  >
                    详情
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
