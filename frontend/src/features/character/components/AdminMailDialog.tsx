import { useEffect, useState } from 'react';
import { Dialog } from '@/shared/components/Dialog';
import { toast } from '@/shared/utils/toast.util';
import { authApi } from '@/features/auth/api/auth.api';
import { QUALITY_COLORS } from '@/shared/constants/game';
import { ICON_BASE_URL, ICON_FALLBACK_URL } from '@/shared/constants/external';
import type { AdminMailReceipt, ItemSearchResult, SendAdminMailPayload } from '../api/character.api';
import { ItemSearchInput } from './ItemSearchInput';

interface AdminMailDialogProps {
  open: boolean;
  onClose: () => void;
  characterName: string;
  characterGuid: number;
  onSubmit: (payload: SendAdminMailPayload) => Promise<{ ok: boolean; receipts: AdminMailReceipt[] }>;
  pending: boolean;
  /** 发送成功后由父组件失效 admin-mails 查询刷新记录面板 */
  onSent: () => void;
}

type Phase = 'compose' | 'confirm' | 'result';
interface AddedItem {
  item: ItemSearchResult;
  count: number;
}

const onlyInt = (v: string) => v.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');

// 管理员发件弹窗（物品/金币）：物品经 typeahead 选择并显示名称/图标/说明防误发；
// 发送不可撤回 → 确认步强制输入管理员密码（SRP6 校验）后才真正发 SOAP
export function AdminMailDialog({ open, onClose, characterName, characterGuid, onSubmit, pending, onSent }: AdminMailDialogProps) {
  const [phase, setPhase] = useState<Phase>('compose');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [addedItems, setAddedItems] = useState<AddedItem[]>([]);
  const [gold, setGold] = useState('');
  const [silver, setSilver] = useState('');
  const [copper, setCopper] = useState('');
  const [password, setPassword] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [result, setResult] = useState<{ ok: boolean; receipts: AdminMailReceipt[] } | null>(null);

  useEffect(() => {
    if (open) {
      setPhase('compose');
      setSubject('');
      setBody('');
      setAddedItems([]);
      setGold('');
      setSilver('');
      setCopper('');
      setPassword('');
      setConfirmError('');
      setResult(null);
    }
  }, [open]);

  const g = parseInt(gold || '0', 10) || 0;
  const s = parseInt(silver || '0', 10) || 0;
  const c = parseInt(copper || '0', 10) || 0;
  const moneyTotal = g * 10000 + s * 100 + c;

  const itemsInvalid = addedItems.some((a) => !Number.isInteger(a.count) || a.count < 1 || a.count > 1000 || (a.item.maxCount > 0 && a.count > a.item.maxCount));
  const canCompose =
    subject.trim().length > 0 &&
    subject.trim().length <= 100 &&
    body.trim().length <= 500 &&
    !itemsInvalid &&
    (addedItems.length > 0 || moneyTotal > 0);

  const addItem = (item: ItemSearchResult) => {
    setAddedItems((prev) => {
      if (prev.some((a) => a.item.entry === item.entry)) {
        toast.error(`物品「${item.name}」已在附件列表中`);
        return prev;
      }
      return [...prev, { item, count: 1 }];
    });
  };

  const updateCount = (entry: number, count: number) => {
    setAddedItems((prev) => prev.map((a) => (a.item.entry === entry ? { ...a, count } : a)));
  };

  const removeItem = (entry: number) => {
    setAddedItems((prev) => prev.filter((a) => a.item.entry !== entry));
  };

  const goConfirm = () => {
    setConfirmError('');
    setPassword('');
    setPhase('confirm');
  };

  // 确认步发送：先验管理员密码（绕过会话语义的专用端点），通过才发邮件
  const submit = (): void => {
    authApi
      .verifyPassword(password)
      .then(() =>
        onSubmit({
          subject: subject.trim(),
          body: body.trim(),
          items: addedItems.map((a) => ({ entry: a.item.entry, count: a.count })),
          money: { gold: g, silver: s, copper: c },
        }),
      )
      .then((res) => {
        setResult(res);
        setPhase('result');
        if (res.ok) {
          toast.success('邮件已发送');
          onSent();
        } else {
          toast.error('发送未生效，请查看回执');
        }
      })
      .catch((err: Error) => {
        setConfirmError(err.message || '发送失败');
      });
  };

  const footer =
    phase === 'compose' ? (
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
          取消
        </button>
        <button
          onClick={goConfirm}
          disabled={!canCompose}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一步：确认发送
        </button>
      </div>
    ) : phase === 'confirm' ? (
      <div className="flex justify-end gap-2">
        <button onClick={() => setPhase('compose')} disabled={pending} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
          返回
        </button>
        <button
          onClick={submit}
          disabled={!password || pending}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? '发送中...' : '确认发送'}
        </button>
      </div>
    ) : (
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
          完成
        </button>
      </div>
    );

  return (
    <Dialog open={open} onClose={onClose} title={`发送邮件 — ${characterName}`} footer={footer}>
      {phase === 'compose' && (
        <div className="space-y-3 text-sm">
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">目标角色</span>
              <span className="font-medium">{characterName}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">角色GUID</span>
              <span>{characterGuid}</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">邮件标题（1-100 字）</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value.slice(0, 100))}
              className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">邮件正文（可选，≤500 字）</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 500))}
              rows={2}
              className="w-full resize-none rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">添加物品（单封附件上限 12 格）</label>
            <ItemSearchInput onSelect={addItem} />
            {addedItems.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {addedItems.map(({ item, count }) => {
                  const color = QUALITY_COLORS[item.quality] ?? '#fff';
                  const iconName = item.icon ?? '';
                  const iconUrl = iconName ? `${ICON_BASE_URL}/${iconName.toLowerCase()}.jpg` : null;
                  const countInvalid = count < 1 || count > 1000 || (item.maxCount > 0 && count > item.maxCount);
                  return (
                    <div key={item.entry} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                      {iconUrl ? (
                        <img
                          src={iconUrl}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded border border-border object-cover"
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
                        <div className="h-8 w-8 shrink-0 rounded border border-border bg-secondary/50" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium" style={{ color }}>
                          {item.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          ID {item.entry}
                          {item.maxCount > 0 && ` · 唯一物品上限 ${item.maxCount}`}
                        </div>
                      </div>
                      <input
                        value={String(count)}
                        onChange={(e) => updateCount(item.entry, parseInt(onlyInt(e.target.value) || '0', 10) || 0)}
                        className={`w-16 rounded-md border bg-card px-2 py-1 text-right text-sm outline-none focus:ring-1 focus:ring-primary ${countInvalid ? 'border-red-500' : 'border-border'}`}
                        title={countInvalid ? '数量不合法' : undefined}
                      />
                      <button
                        onClick={() => removeItem(item.entry)}
                        className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                        title="移除"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">附带金币（可选；物品与金币将分两封邮件送达）</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">金</span>
              <input
                value={gold}
                onChange={(e) => setGold(onlyInt(e.target.value).slice(0, 5))}
                placeholder="0"
                className="w-20 rounded-md border border-border bg-card px-2 py-1 text-right text-sm outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-xs text-muted-foreground">银</span>
              <input
                value={silver}
                onChange={(e) => setSilver(onlyInt(e.target.value).slice(0, 2))}
                placeholder="0"
                className="w-14 rounded-md border border-border bg-card px-2 py-1 text-right text-sm outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-xs text-muted-foreground">铜</span>
              <input
                value={copper}
                onChange={(e) => setCopper(onlyInt(e.target.value).slice(0, 2))}
                placeholder="0"
                className="w-14 rounded-md border border-border bg-card px-2 py-1 text-right text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {(g > 0 || s > 0 || c > 0) && (
              <p className="mt-1 text-xs text-muted-foreground">
                合计 {g}金 {s}银 {c}铜
              </p>
            )}
          </div>
          {itemsInvalid && <p className="text-xs text-red-400">存在数量不合法的附件，请修正后再继续</p>}
        </div>
      )}

      {phase === 'confirm' && (
        <div className="space-y-3 text-sm">
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">收件角色</span>
              <span className="font-medium">{characterName}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">标题</span>
              <span className="max-w-[60%] truncate">{subject}</span>
            </div>
            {addedItems.length > 0 && (
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">物品附件</span>
                <span>
                  {addedItems.map((a) => `${a.item.name}×${a.count}`).join('、')}
                </span>
              </div>
            )}
            {moneyTotal > 0 && (
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">金币</span>
                <span>
                  {g}金 {s}银 {c}铜
                </span>
              </div>
            )}
          </div>
          <p className="text-xs text-amber-500">邮件发送后不可撤回，请确认附件与金额无误。</p>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">输入你的管理员登录密码以确认发送</label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setConfirmError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && password && !pending) submit();
              }}
              autoComplete="current-password"
              className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
            />
            {confirmError && <p className="mt-1 text-xs text-red-400">{confirmError}</p>}
          </div>
        </div>
      )}

      {phase === 'result' && result && (
        <div className="space-y-2 text-sm">
          <p className={result.ok ? 'text-green-500' : 'text-red-400'}>{result.ok ? '邮件已发送' : '发送未生效'}</p>
          {result.receipts.map((r) => (
            <div key={r.type} className="rounded-md bg-muted/40 px-3 py-2">
              <div className="text-xs font-medium text-muted-foreground">{r.type === 'items' ? '物品邮件' : '金币邮件'}</div>
              <div className={`mt-0.5 font-mono text-xs break-all ${r.ok ? '' : 'text-red-400'}`}>{r.message || '（无回执）'}</div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
