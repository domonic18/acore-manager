import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useAccountDetail,
  useAccountCharacters,
  useUnbanAccount,
  useBanAccount,
  useAccountLoginHistory,
  useChangePassword,
} from '@/features/account/hooks/useAccount';
import { Dialog } from '@/shared/components/Dialog';
import { raceMap, classMap, banReasonOptions, durationLabels } from '@/shared/constants/game.constants';
import { toast } from '@/shared/utils/toast.util';

function formatMuteTime(muteTime: number): string {
  if (!muteTime || muteTime <= 0) return '-';
  const now = Math.floor(Date.now() / 1000);
  if (muteTime <= now) return '-';
  const remaining = muteTime - now;
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  return parts.length > 0 ? parts.join('') : '不足1分钟';
}

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const accountId = parseInt(id || '0');
  const { data: account, isLoading } = useAccountDetail(accountId);
  const { data: characters, isLoading: charsLoading } = useAccountCharacters(accountId);
  const { data: loginHistory, isLoading: historyLoading } = useAccountLoginHistory(accountId);
  const unbanMutation = useUnbanAccount();
  const banMutation = useBanAccount();
  const changePasswordMutation = useChangePassword();

  // 封禁对话框状态
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [banDuration, setBanDuration] = useState('1d');
  const [banReasonType, setBanReasonType] = useState('违规');
  const [customReason, setCustomReason] = useState('');

  // 更改密码对话框状态
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 解封确认对话框状态
  const [showUnbanConfirmDialog, setShowUnbanConfirmDialog] = useState(false);

  const isCustomReason = banReasonType === '__custom__';
  const finalBanReason = isCustomReason ? customReason : banReasonType;
  const canProceed = !isCustomReason || customReason.trim().length > 0;
  const passwordsMatch = newPassword.length >= 4 && newPassword === confirmPassword;

  const handleOpenBanDialog = () => {
    setBanDuration('1d');
    setBanReasonType('违规');
    setCustomReason('');
    setShowBanDialog(true);
  };

  const handleProceedToConfirm = () => {
    if (!canProceed) return;
    setShowBanDialog(false);
    setShowConfirmDialog(true);
  };

  const handleExecuteBan = () => {
    banMutation.mutate(
      { id: accountId, data: { duration: banDuration, reason: finalBanReason } },
      {
        onSuccess: () => {
          setShowConfirmDialog(false);
          toast.success('封禁操作成功');
        },
        onError: (error: any) => {
          toast.error(error?.message || '封禁失败，请检查 SOAP 服务器连接');
        },
      }
    );
  };

  const handleOpenUnbanConfirm = () => {
    setShowUnbanConfirmDialog(true);
  };

  const handleExecuteUnban = () => {
    unbanMutation.mutate(accountId, {
      onSuccess: () => {
        setShowUnbanConfirmDialog(false);
        toast.success('解禁成功');
      },
      onError: (error: any) => {
        toast.error(error?.message || '解禁失败，请检查 SOAP 服务器连接');
      },
    });
  };

  const handleChangePassword = () => {
    if (!passwordsMatch) return;
    changePasswordMutation.mutate(
      { id: accountId, password: newPassword },
      {
        onSuccess: () => {
          setShowPasswordDialog(false);
          setNewPassword('');
          setConfirmPassword('');
          toast.success('密码修改成功');
        },
        onError: (error: any) => {
          toast.error(error?.message || '密码修改失败，请检查 SOAP 服务器连接');
        },
      }
    );
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
          <button
            onClick={() => {
              setNewPassword('');
              setConfirmPassword('');
              setShowPasswordDialog(true);
            }}
            className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            更改密码
          </button>
          {activeBans.length > 0 ? (
            <button
              onClick={handleOpenUnbanConfirm}
              disabled={unbanMutation.isPending}
              className="px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {unbanMutation.isPending ? '处理中...' : '解禁账号'}
            </button>
          ) : (
            <button
              onClick={handleOpenBanDialog}
              className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700"
            >
              封禁账号
            </button>
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
          <InfoRow label="禁言时长" value={formatMuteTime(account.muteTime)} />
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

      {loginHistory && loginHistory.length > 0 && (
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
                  {loginHistory.map((record, index) => (
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
                      {new Date(ban.banDate).getTime() === new Date(ban.unbanDate).getTime() ? (
                        <span className="text-red-400">永久</span>
                      ) : (
                        new Date(ban.unbanDate).toLocaleString('zh-CN')
                      )}
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

      {/* 封禁信息填写对话框 */}
      <Dialog
        open={showBanDialog}
        onClose={() => setShowBanDialog(false)}
        title="封禁账号"
        footer={
          <>
            <button
              onClick={() => setShowBanDialog(false)}
              className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
            >
              取消
            </button>
            <button
              onClick={handleProceedToConfirm}
              disabled={!canProceed}
              className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              下一步
            </button>
          </>
        }
      >
        <div className="bg-muted/50 rounded-md p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">目标账号</span>
            <span className="font-medium">{account.username}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-muted-foreground">账号ID</span>
            <span>{account.id}</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">封禁时长</label>
          <select
            value={banDuration}
            onChange={(e) => setBanDuration(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="1h">1小时</option>
            <option value="1d">1天</option>
            <option value="7d">7天</option>
            <option value="30d">30天</option>
            <option value="-1">永久</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">封禁原因</label>
          <select
            value={banReasonType}
            onChange={(e) => setBanReasonType(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {banReasonOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {isCustomReason && (
          <div>
            <label className="block text-sm font-medium mb-1.5">自定义原因</label>
            <input
              type="text"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="请输入封禁原因"
              className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}
      </Dialog>

      {/* 二次确认对话框 */}
      <Dialog
        open={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        title="确认封禁"
        footer={
          <>
            <button
              onClick={() => {
                setShowConfirmDialog(false);
                setShowBanDialog(true);
              }}
              className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
            >
              返回修改
            </button>
            <button
              onClick={handleExecuteBan}
              disabled={banMutation.isPending}
              className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {banMutation.isPending ? '处理中...' : '确认封禁'}
            </button>
          </>
        }
      >
        <div className="text-sm text-muted-foreground mb-4">
          请再次确认以下封禁信息，操作后将立即生效：
        </div>

        <div className="space-y-3 bg-muted/50 rounded-md p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">目标账号</span>
            <span className="font-medium">{account.username}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">封禁时长</span>
            <span className="font-medium text-red-400">{durationLabels[banDuration]}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">封禁原因</span>
            <span className="font-medium">{finalBanReason}</span>
          </div>
        </div>
      </Dialog>

      {/* 更改密码对话框 */}
      <Dialog
        open={showPasswordDialog}
        onClose={() => setShowPasswordDialog(false)}
        title="更改密码"
        footer={
          <>
            <button
              onClick={() => setShowPasswordDialog(false)}
              className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
            >
              取消
            </button>
            <button
              onClick={handleChangePassword}
              disabled={!passwordsMatch || changePasswordMutation.isPending}
              className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {changePasswordMutation.isPending ? '处理中...' : '确认更改'}
            </button>
          </>
        }
      >
        <div className="bg-muted/50 rounded-md p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">目标账号</span>
            <span className="font-medium">{account.username}</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">新密码</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="输入新密码（至少4位）"
            className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">确认密码</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="再次输入新密码"
            className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="text-xs text-red-400 mt-1">两次输入的密码不一致</p>
          )}
        </div>
      </Dialog>

      {/* 解禁确认对话框 */}
      <Dialog
        open={showUnbanConfirmDialog}
        onClose={() => setShowUnbanConfirmDialog(false)}
        title="确认解禁"
        footer={
          <>
            <button
              onClick={() => setShowUnbanConfirmDialog(false)}
              className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
            >
              取消
            </button>
            <button
              onClick={handleExecuteUnban}
              disabled={unbanMutation.isPending}
              className="px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {unbanMutation.isPending ? '处理中...' : '确认解禁'}
            </button>
          </>
        }
      >
        <div className="text-sm text-muted-foreground mb-4">
          确认要解禁账号 <span className="font-medium text-foreground">{account?.username}</span> 吗？
        </div>
      </Dialog>
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
