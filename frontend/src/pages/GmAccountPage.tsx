import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGmAccountList } from '@/features/account/hooks/useAccount';

export default function GmAccountPage() {
  const navigate = useNavigate();
  const { data: gmAccounts, isLoading } = useGmAccountList();
  const [search, setSearch] = useState('');

  const filtered = gmAccounts?.filter(
    (gm) =>
      !search ||
      gm.username.toLowerCase().includes(search.toLowerCase()) ||
      gm.email?.toLowerCase().includes(search.toLowerCase()) ||
      gm.realmName.toLowerCase().includes(search.toLowerCase())
  );

  const groupedByAccount = filtered?.reduce((acc, gm) => {
    if (!acc[gm.accountId]) {
      acc[gm.accountId] = {
        accountId: gm.accountId,
        username: gm.username,
        email: gm.email,
        entries: [],
      };
    }
    acc[gm.accountId].entries.push(gm);
    return acc;
  }, {} as Record<number, { accountId: number; username: string; email: string; entries: typeof filtered }>);

  const groupedList = groupedByAccount ? Object.values(groupedByAccount) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">GM 账号列表</h1>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索账号 / 邮箱 / 服务器"
          className="px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">账号ID</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">用户名</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">邮箱</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">权限</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">服务器范围</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">备注</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  加载中...
                </td>
              </tr>
            ) : groupedList.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  暂无 GM 账号
                </td>
              </tr>
            ) : (
              groupedList.map((group) =>
                group.entries.map((gm, idx) => (
                  <tr
                    key={`${gm.accountId}-${gm.realmId}`}
                    className="border-b border-border hover:bg-accent/50"
                  >
                    {idx === 0 && (
                      <>
                        <td
                          rowSpan={group.entries.length}
                          className="px-4 py-3 align-middle"
                        >
                          <button
                            onClick={() => navigate(`/accounts/${group.accountId}`)}
                            className="text-primary hover:underline"
                          >
                            {group.accountId}
                          </button>
                        </td>
                        <td
                          rowSpan={group.entries.length}
                          className="px-4 py-3 font-medium align-middle"
                        >
                          <button
                            onClick={() => navigate(`/accounts/${group.accountId}`)}
                            className="hover:underline"
                          >
                            {group.username}
                          </button>
                        </td>
                        <td
                          rowSpan={group.entries.length}
                          className="px-4 py-3 text-muted-foreground align-middle"
                        >
                          {group.email || '-'}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          gm.gmlevel >= 4
                            ? 'bg-red-500/20 text-red-400'
                            : gm.gmlevel >= 3
                            ? 'bg-orange-500/20 text-orange-400'
                            : gm.gmlevel >= 2
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}
                      >
                        GM {gm.gmlevel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {gm.realmName}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate" title={gm.comment}>
                      {gm.comment || '-'}
                    </td>
                  </tr>
                ))
              )
            )}
          </tbody>
        </table>
      </div>

      {groupedList.length > 0 && (
        <p className="text-sm text-muted-foreground">
          共 {gmAccounts?.length || 0} 条权限记录，{groupedList.length} 个账号
        </p>
      )}
    </div>
  );
}
