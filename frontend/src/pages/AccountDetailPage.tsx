import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/shared/components/AppLayout';
import { useAccountDetail, useUnbanAccount } from '@/features/account/hooks/useAccount';

export function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const accountId = parseInt(id || '0');
  const { data: account, isLoading } = useAccountDetail(accountId);
  const unbanMutation = useUnbanAccount();

  const handleUnban = () => {
    if (!confirm('确认解禁该账号？')) return;
    unbanMutation.mutate(accountId);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-muted-foreground">加载中...</div>
      </AppLayout>
    );
  }

  if (!account) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-muted-foreground">账号不存在</div>
      </AppLayout>
    );
  }

  const activeBans = account.bans?.filter((b) => b.active) || [];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/accounts')}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← 返回列表
          </button>
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{account.username}</h1>
          {activeBans.length > 0 && (
            <button
              onClick={handleUnban}
              disabled={unbanMutation.isPending}
              className="px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {unbanMutation.isPending ? '处理中...' : '解禁账号'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoCard title="基本信息">
            <InfoRow label="ID" value={account.id} />
            <InfoRow label="用户名" value={account.username} />
            <InfoRow label="邮箱" value={account.email || '-'} />
            <InfoRow label="GM等级" value={account.gmlevel || '玩家'} />
            <InfoRow
              label="状态"
              value={account.online ? '在线' : account.locked ? '锁定' : '离线'}
            />
            <InfoRow
              label="注册时间"
              value={new Date(account.joinDate).toLocaleString('zh-CN')}
            />
            <InfoRow
              label="最后登录"
              value={
                account.lastLogin
                  ? new Date(account.lastLogin).toLocaleString('zh-CN')
                  : '-'
              }
            />
            <InfoRow label="最后IP" value={account.lastIp || '-'} />
          </InfoCard>

          <InfoCard title="其他信息">
            <InfoRow label="登录失败次数" value={account.failedLogins} />
            <InfoRow label="总在线时长" value={`${Math.floor(account.totalTime / 3600)} 小时`} />
            <InfoRow label="禁言时长" value={account.muteTime > 0 ? `${account.muteTime} 秒` : '-'} />
            <InfoRow label="禁言原因" value={account.muteReason || '-'} />
          </InfoCard>
        </div>

        {account.bans && account.bans.length > 0 && (
          <InfoCard title="封禁记录">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-muted-foreground">封禁时间</th>
                    <th className="px-3 py-2 text-left text-muted-foreground">解封时间</th>
                    <th className="px-3 py-2 text-left text-muted-foreground">操作人</th>
                    <th className="px-3 py-2 text-left text-muted-foreground">原因</th>
                    <th className="px-3 py-2 text-left text-muted-foreground">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {account.bans.map((ban, index) => (
                    <tr key={index} className="border-b border-border">
                      <td className="px-3 py-2">
                        {new Date(ban.banDate).toLocaleString('zh-CN')}
                      </td>
                      <td className="px-3 py-2">
                        {new Date(ban.unbanDate).toLocaleString('zh-CN')}
                      </td>
                      <td className="px-3 py-2">{ban.bannedBy}</td>
                      <td className="px-3 py-2">{ban.banReason}</td>
                      <td className="px-3 py-2">
                        {ban.active ? (
                          <span className="text-red-400">生效中</span>
                        ) : (
                          <span className="text-green-400">已解除</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </InfoCard>
        )}
      </div>
    </AppLayout>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
