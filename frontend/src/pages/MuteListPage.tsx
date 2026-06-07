import { useNavigate } from 'react-router-dom';
import { useMuteList } from '@/features/mute/hooks/useMute';

export default function MuteListPage() {
  const navigate = useNavigate();
  const { data: mutes, isLoading } = useMuteList();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">禁言列表</h1>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">账号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">角色</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">最后IP</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">禁言原因</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">到期时间</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">操作人</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  加载中...
                </td>
              </tr>
            ) : mutes?.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  暂无被禁言的账号
                </td>
              </tr>
            ) : (
              mutes?.map((mute, index) => (
                <tr
                  key={`${mute.accountId}-${index}`}
                  className="border-b border-border hover:bg-accent/50"
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={() => navigate(`/accounts/${mute.accountId}`)}
                      className="font-medium text-primary hover:underline"
                    >
                      {mute.username}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {mute.characterNames ? (
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
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                    {mute.lastIp || '-'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate" title={mute.muteReason}>
                    {mute.muteReason || '-'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(mute.muteTime).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {mute.mutedBy || '-'}
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
