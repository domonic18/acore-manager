import { useNavigate } from 'react-router-dom';
import type { GmAccountItem } from '@/features/account/api/account.api';

interface GmAccountGroup {
  accountId: number;
  username: string;
  email?: string;
  entries: GmAccountItem[];
}

interface GmAccountTableProps {
  gms: GmAccountItem[] | undefined;
  loading: boolean;
  search: string;
}

export function GmAccountTable({ gms, loading, search }: GmAccountTableProps) {
  const navigate = useNavigate();

  const filtered = (gms ?? []).filter(
    (gm) =>
      !search ||
      gm.username.toLowerCase().includes(search.toLowerCase()) ||
      gm.email?.toLowerCase().includes(search.toLowerCase()) ||
      gm.realmName.toLowerCase().includes(search.toLowerCase())
  );

  const groupedByAccount = filtered.reduce<GmAccountGroup[]>((acc, gm) => {
    const existing = acc.find((group) => group.accountId === gm.accountId);
    if (existing) {
      existing.entries.push(gm);
    } else {
      acc.push({ accountId: gm.accountId, username: gm.username, email: gm.email, entries: [gm] });
    }
    return acc;
  }, []);

  return (
    <>
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
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  加载中...
                </td>
              </tr>
            ) : groupedByAccount.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  暂无 GM 账号
                </td>
              </tr>
            ) : (
              groupedByAccount.map((group) =>
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

      {groupedByAccount.length > 0 && (
        <p className="text-sm text-muted-foreground">
          共 {gms?.length || 0} 条权限记录，{groupedByAccount.length} 个账号
        </p>
      )}
    </>
  );
}
