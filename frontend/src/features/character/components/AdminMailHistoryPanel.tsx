import { useAdminMails } from '../hooks/useCharacter';
import { QUALITY_COLORS } from '@/shared/constants/game';
import { ICON_BASE_URL, ICON_FALLBACK_URL } from '@/shared/constants/external';
import type { AdminMailHistoryItem } from '../api/character.api';

function formatMoney(copper: number): string {
  if (copper <= 0) return '-';
  const g = Math.floor(copper / 10000);
  const s = Math.floor((copper % 10000) / 100);
  const c = copper % 100;
  return `${g}金 ${s}银 ${c}铜`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

function MailItemIcon({ item }: { item: AdminMailHistoryItem['items'][number] }) {
  const color = QUALITY_COLORS[item.quality] ?? '#fff';
  const iconName = item.icon ?? '';
  const iconUrl = iconName ? `${ICON_BASE_URL}/${iconName.toLowerCase()}.jpg` : null;
  return (
    <span className="relative inline-block" title={`${item.name}×${item.count}`}>
      {iconUrl ? (
        <img
          src={iconUrl}
          alt={item.name}
          className="h-7 w-7 rounded border-2 object-cover"
          style={{ borderColor: color }}
          loading="lazy"
          onError={(e) => {
            const t = e.target as HTMLImageElement;
            if (!t.src.includes(ICON_FALLBACK_URL)) {
              t.src = `${ICON_FALLBACK_URL}/${iconName.toLowerCase()}.jpg`;
            } else {
              t.style.display = 'none';
            }
          }}
        />
      ) : (
        <span className="inline-block h-7 w-7 rounded border-2 bg-secondary/50" style={{ borderColor: color }} />
      )}
      {item.count > 1 && (
        <span className="absolute -bottom-1 -right-1 rounded bg-black/70 px-0.5 text-[10px] font-medium text-white">{item.count}</span>
      )}
    </span>
  );
}

// 管理员发件记录（角色详情页独立区块）：数据源为 characters.mail 表中
// stationery=61 且（sender=自己 或 sender=0）的管理员邮件；
// 已读取自 checked 位掩码；has_items=1 但附件行已清空 = 附件已领取
export function AdminMailHistoryPanel({ guid }: { guid: number }) {
  const { data: mails, isLoading, refetch, isFetching } = useAdminMails(guid);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          通过管理后台发送的邮件（含已读/领取状态）；玩家未读前状态为「未读」，领取附件或金币后对应条目显示「已领取」
        </p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
        >
          {isFetching ? '刷新中...' : '刷新'}
        </button>
      </div>

      {isLoading ? (
        <div className="rounded-md border border-border px-4 py-6 text-center text-sm text-muted-foreground">加载中...</div>
      ) : !mails || mails.length === 0 ? (
        <div className="rounded-md border border-border px-4 py-6 text-center text-sm text-muted-foreground">暂无管理员发件记录</div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium whitespace-nowrap">投递时间</th>
                <th className="px-3 py-2 font-medium">标题 / 正文</th>
                <th className="px-3 py-2 font-medium">物品附件</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">金币</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">状态</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">到期</th>
              </tr>
            </thead>
            <tbody>
              {mails.map((mail) => {
                const claimed = mail.hasItems && mail.items.length === 0;
                return (
                  <tr key={mail.id} className="border-b border-border/60 last:border-b-0">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{formatTime(mail.deliverTime)}</td>
                    <td className="max-w-[220px] px-3 py-2">
                      <div className="truncate font-medium">{mail.subject || '(无标题)'}</div>
                      {mail.body && <div className="truncate text-xs text-muted-foreground">{mail.body}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {mail.items.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {mail.items.map((it, idx) => (
                            <MailItemIcon key={`${mail.id}-${idx}`} item={it} />
                          ))}
                        </div>
                      ) : mail.hasItems ? (
                        <span className="text-xs text-muted-foreground">已领取</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{mail.money > 0 ? formatMoney(mail.money) : <span className="text-xs text-muted-foreground">-</span>}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          mail.read ? 'bg-muted text-muted-foreground' : 'bg-amber-500/15 text-amber-500'
                        }`}
                      >
                        {mail.read ? '已读' : '未读'}
                      </span>
                      {claimed && <div className="mt-0.5 text-[10px] text-muted-foreground">附件已领取</div>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{formatTime(mail.expireTime)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
