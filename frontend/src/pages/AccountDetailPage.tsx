import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useAccountDetail,
  useAccountCharacters,
  useUnbanAccount,
  useBanAccount,
  useAccountLoginHistory,
} from '@/features/account/hooks/useAccount';

const raceMap: Record<number, string> = {
  1: '人类', 2: '兽人', 3: '矮人', 4: '暗夜精灵', 5: '亡灵',
  6: '牛头人', 7: '侏儒', 8: '巨魔', 9: '地精', 10: '血精灵',
  11: '德莱尼', 22: '狼人',
};

const classMap: Record<number, string> = {
  1: '战士', 2: '圣骑士', 3: '猎人', 4: '潜行者', 5: '牧师',
  6: '死亡骑士', 7: '萨满', 8: '法师', 9: '术士', 11: '德鲁伊',
};

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const accountId = parseInt(id || '0');
  const { data: account, isLoading } = useAccountDetail(accountId);
  const { data: characters, isLoading: charsLoading } = useAccountCharacters(accountId);
  const { data: loginHistory, isLoading: historyLoading } = useAccountLoginHistory(accountId);
  const unbanMutation = useUnbanAccount();
  const banMutation = useBanAccount();

  const [showBanForm, setShowBanForm] = useState(false);
  const [banDuration, setBanDuration] = useState('1d');
  const [banReason, setBanReason] = useState('违规');

  const handleUnban = () => {
    if (!confirm('确认解禁该账号？')) return;
    unbanMutation.mutate(accountId);
  };

  const handleBan = () => {
    if (!confirm(`确认封禁该账号？\n时长: ${banDuration}\n原因: ${banReason}`)) return;
    banMutation.mutate({ id: accountId, data: { duration: banDuration, reason: banReason } });
    setShowBanForm(false);
  };

  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">加载中...</div>
    );
  }

  if (!account) {
    return (
      <div className="text-center py-12 text-muted-foreground">账号不存在</div>
    );
  }

  const activeBans = account.bans?.filter((b) => b.active) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/accounts')}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← 返回列表
        </button>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">{account.username}</h1>
        <div className="flex gap-2">
          {activeBans.length > 0 ? (
            <button
              onClick={handleUnban}
              disabled={unbanMutation.isPending}
              className="px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {unbanMutation.isPending ? '处理中...' : '解禁账号'}
            </button>
          ) : (
            <>
              {showBanForm ? (
                <div className="flex items-center gap-2">
                  <select
                    value={banDuration}
                    onChange={(e) => setBanDuration(e.target.value)}
                    className="px-2 py-1.5 rounded-md border border-border bg-card text-sm"
                  >
                    <option value="1h">1小时</option>
                    <option value="1d">1天</option>
                    <option value="7d">7天</option>
                    <option value="30d">30天</option>
                    <option value="-1">永久</option>
                  </select>
                  <input
                    type="text"
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    placeholder="封禁原因"
                    className="px-2 py-1.5 rounded-md border border-border bg-card text-sm w-32"
                  />
                  <button
                    onClick={handleBan}
                    disabled={banMutation.isPending}
                    className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                  >
                    {banMutation.isPending ? '...' : '确认'}
                  </button>
                  <button
                    onClick={() => setShowBanForm(false)}
                    className="px-3 py-1.5 rounded-md border border-border text-sm"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowBanForm(true)}
                  className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700"
                >
                  封禁账号
                </button>
              )}
            </>
          )}
        </div>
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
          <InfoRow label="角色数量" value={account.characterCount || 0} />
          <InfoRow label="禁言时长" value={account.muteTime > 0 ? `${account.muteTime} 秒` : '-'} />
          <InfoRow label="禁言原因" value={account.muteReason || '-'} />
        </InfoCard>
      </div>

      <InfoCard title="角色列表">
        {charsLoading ? (
          <div className="text-center py-8 text-muted-foreground">加载中...</div>
        ) : !characters || characters.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">该账号下暂无角色</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-muted-foreground">名称</th>
                  <th className="px-3 py-2 text-left text-muted-foreground">等级</th>
                  <th className="px-3 py-2 text-left text-muted-foreground">种族</th>
                  <th className="px-3 py-2 text-left text-muted-foreground">职业</th>
                  <th className="px-3 py-2 text-left text-muted-foreground">状态</th>
                </tr>
              </thead>
              <tbody>
                {characters.map((char) => (
                  <tr
                    key={char.guid}
                    className="border-b border-border hover:bg-accent/50 cursor-pointer"
                    onClick={() => navigate(`/characters/${char.guid}`)}
                  >
                    <td className="px-3 py-2 font-medium">{char.name}</td>
                    <td className="px-3 py-2">{char.level}</td>
                    <td className="px-3 py-2 text-muted-foreground">{raceMap[char.race] || '未知'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{classMap[char.class] || '未知'}</td>
                    <td className="px-3 py-2">
                      {char.online ? (
                        <span className="text-green-400">在线</span>
                      ) : (
                        <span className="text-muted-foreground">离线</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </InfoCard>

      {loginHistory && loginHistory.items.length > 0 && (
        <InfoCard title="登录历史">
          {historyLoading ? (
            <div className="text-center py-8 text-muted-foreground">加载中...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-muted-foreground">时间</th>
                    <th className="px-3 py-2 text-left text-muted-foreground">IP</th>
                    <th className="px-3 py-2 text-left text-muted-foreground">动作</th>
                    <th className="px-3 py-2 text-left text-muted-foreground">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {loginHistory.items.map((record, index) => (
                    <tr key={index} className="border-b border-border">
                      <td className="px-3 py-2">
                        {new Date(record.time).toLocaleString('zh-CN')}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{record.ip}</td>
                      <td className="px-3 py-2">{record.action}</td>
                      <td className="px-3 py-2 text-muted-foreground">{record.comment || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </InfoCard>
      )}

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
