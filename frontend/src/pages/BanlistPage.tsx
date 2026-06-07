import { useNavigate } from 'react-router-dom';
import { useBanlist } from '@/features/banlist/hooks/useBanlist';

export default function BanlistPage() {
  const navigate = useNavigate();
  const { data: bans, isLoading } = useBanlist();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">封号列表</h1>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">类型</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">账号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">角色</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">最后IP</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">封禁原因</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">封禁时间</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">解封时间</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">操作人</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  加载中...
                </td>
              </tr>
            ) : bans?.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  暂无被封禁的账号或角色
                </td>
              </tr>
            ) : (
              bans?.map((ban) => (
                <tr
                  key={`${ban.accountId}-${ban.banDate}-${ban.banType}`}
                  className="border-b border-border hover:bg-accent/50"
                >
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        ban.banType === 'account'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-orange-500/20 text-orange-400'
                      }`}
                    >
                      {ban.banType === 'account' ? '账号' : '角色'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => navigate(`/accounts/${ban.accountId}`)}
                      className="font-medium text-primary hover:underline"
                    >
                      {ban.username}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {ban.characterNames ? (
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
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                    {ban.lastIp || '-'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate" title={ban.banReason}>
                    {ban.banReason || '-'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(ban.banDate).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(ban.unbanDate).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {ban.bannedBy || '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
