import { useEffect, useState } from 'react';
import { Dialog } from '@/shared/components/Dialog';
import { toast } from '@/shared/utils/toast.util';
import type { WatchlistInput, WatchlistItem } from '../api/ai-diagnosis.api';
import { useCreateWatchlist, useUpdateWatchlist } from '../hooks/useAiDiagnosis';

// 观察名单表单弹窗：黑/白 × 角色/账号两级，(realm, subjectType, subjectName) 唯一，
// 黑白互斥（切换走编辑）。黑名单注明嫌疑来源（如聊天渠道发现），白名单注明信任依据。

interface WatchlistFormDialogProps {
  editing: WatchlistItem | null;
  open: boolean;
  onClose: () => void;
}

export function WatchlistFormDialog({ editing, open, onClose }: WatchlistFormDialogProps) {
  const create = useCreateWatchlist();
  const update = useUpdateWatchlist();
  const [listType, setListType] = useState<'white' | 'black'>('black');
  const [subjectType, setSubjectType] = useState<'character' | 'account'>('character');
  const [subjectName, setSubjectName] = useState('');
  const [realm, setRealm] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setListType(editing.listType);
      setSubjectType(editing.subjectType);
      setSubjectName(editing.subjectName);
      setRealm(editing.realm);
      setReason(editing.reason);
    } else {
      setListType('black');
      setSubjectType('character');
      setSubjectName('');
      setRealm('');
      setReason('');
    }
  }, [open, editing]);

  const submitting = create.isPending || update.isPending;
  const canSubmit =
    subjectName.trim().length >= 2 && realm.trim().length >= 2 && reason.trim().length >= 2 && !submitting;

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) return;
    const input: WatchlistInput = {
      listType,
      subjectType,
      subjectName: subjectName.trim(),
      realm: realm.trim(),
      reason: reason.trim(),
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: input });
        toast.success('名单条目已更新');
      } else {
        await create.mutateAsync(input);
        toast.success('名单条目已录入');
      }
      onClose();
    } catch (err) {
      toast.error((err as Error).message || '提交失败');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `编辑名单条目 #${editing.id}` : '添加观察名单'}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
            取消
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? '提交中...' : '提交'}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">名单类型</label>
          <select
            value={listType}
            onChange={(e) => setListType(e.target.value as 'white' | 'black')}
            className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="black">黑名单（重点分析，命中升档）</option>
            <option value="white">白名单（低风险，检出异常降档）</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">对象类型</label>
          <select
            value={subjectType}
            onChange={(e) => setSubjectType(e.target.value as 'character' | 'account')}
            className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="character">角色（按角色名匹配）</option>
            <option value="account">账号（对其名下全部角色生效）</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{subjectType === 'account' ? '账号名' : '角色名'}（须与角色库完全一致）</label>
          <input
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
            placeholder={subjectType === 'account' ? '如 firegm01' : '如 元吉'}
            className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">服务器（realm）</label>
          <input
            value={realm}
            onChange={(e) => setRealm(e.target.value)}
            placeholder="如 realm3"
            className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-muted-foreground">
            {listType === 'black' ? '嫌疑来源与依据（2-500 字，检测报告引用）' : '信任依据（2-500 字，检测报告引用）'}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={
              listType === 'black'
                ? '如：世界频道对话中提及使用外挂协议（2026-10-08 GM 截图取证）'
                : '如：站长小号，长期人工核查无异常'
            }
            className="w-full resize-y rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
    </Dialog>
  );
}
