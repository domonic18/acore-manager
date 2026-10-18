import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog } from '@/shared/components/Dialog';
import { toast } from '@/shared/utils/toast.util';

interface KickDialogProps {
  open: boolean;
  onClose: () => void;
  characterName: string;
  characterGuid: number;
  onSubmit: (reason?: string) => Promise<{ ok: boolean; message: string }>;
  pending: boolean;
}

type Phase = 'confirm' | 'result';

export function KickDialog({ open, onClose, characterName, characterGuid, onSubmit, pending }: KickDialogProps) {
  const [phase, setPhase] = useState<Phase>('confirm');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setPhase('confirm');
      setReason('');
      setResult(null);
    }
  }, [open]);

  const submit = (): void => {
    onSubmit(reason.trim() || undefined)
      .then((res) => {
        setResult(res);
        setPhase('result');
        if (res.ok) {
          toast.success(`${characterName} 已踢下线`);
          queryClient.invalidateQueries({ queryKey: ['characters'] });
        } else {
          toast.error('踢下线未生效，请查看回执');
        }
      })
      .catch((err: Error) => toast.error(err.message || '踢下线失败'));
  };

  const footer =
    phase === 'confirm' ? (
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
          取消
        </button>
        <button
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? '执行中...' : '确认踢下线'}
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
    <Dialog open={open} onClose={onClose} title={`踢下线 — ${characterName}`} footer={footer}>
      {phase === 'confirm' && (
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
          <p>确认将该玩家踢下线？操作会记录审计日志。</p>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">原因（可选，记入审计）</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 200))}
              placeholder="如：警告后拒绝下线"
              className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      )}

      {phase === 'result' && result && (
        <div className="space-y-2 text-sm">
          <p className={result.ok ? 'text-green-500' : 'text-red-400'}>{result.ok ? '踢下线指令已执行' : '踢下线未生效'}</p>
          <div className="rounded-md bg-muted/40 px-3 py-2 font-mono text-xs break-all">{result.message || '（无回执）'}</div>
        </div>
      )}
    </Dialog>
  );
}
