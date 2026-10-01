import { InfoCard, InfoRow } from '@/shared/components/InfoCard';
import type { AccountDetail } from '@/features/account/api/account.api';

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

export function AccountDetailInfo({ account }: { account: AccountDetail }) {
  return (
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
  );
}
