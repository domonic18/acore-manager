import { useEffect, useState } from 'react';
import { Dialog } from '@/shared/components/Dialog';
import { toast } from '@/shared/utils/toast.util';

interface MessageDialogProps {
  open: boolean;
  onClose: () => void;
  characterName: string;
  characterGuid: number;
  online: boolean;
  onSubmit: (message: string) => Promise<{ ok: boolean; message: string; channel: 'chat' | 'mail' }>;
  pending: boolean;
}

type Phase = 'confirm' | 'result';

// 单向私信弹窗：在线经 .send message 送聊天区，离线自动降级为邮件入邮箱
export function MessageDialog({ open, onClose, characterName, characterGuid, online, onSubmit, pending }: MessageDialogProps) {
  const [phase, setPhase] = useState<Phase>('confirm');
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string; channel: 'chat' | 'mail' } | null>(null);

  useEffect(() => {
    if (open) {
      setPhase('confirm');
      setText('');
      setResult(null);
    }
  }, [open]);

  const canProceed = text.trim().length > 0;

  const submit = (): void => {
    onSubmit(text.trim())
      .then((res) => {
        setResult(res);
        setPhase('result');
        if (res.ok) {
          toast.success(res.channel === 'chat' ? '消息已送达聊天区' : '角色离线，已转为邮件发送');
        } else {
          toast.error('发送未生效，请查看回执');
        }
      })
      .catch((err: Error) => toast.error(err.message || '发送失败'));
  };

  const footer =
    phase === 'confirm' ? (
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
          取消
        </button>
        <button
          onClick={submit}
          disabled={!canProceed || pending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? '发送中...' : '发送'}
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
    <Dialog open={open} onClose={onClose} title={`发消息 — ${characterName}`} footer={footer}>
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
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">消息内容（1-255 字）</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 255))}
              rows={4}
              placeholder={online ? '将以管理员消息形式出现在其聊天区' : '角色离线：将以「管理员消息」邮件投递到邮箱'}
              className="w-full resize-none rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-xs text-muted-foreground">{text.length}/255</p>
          </div>
        </div>
      )}

      {phase === 'result' && result && (
        <div className="space-y-2 text-sm">
          <p className={result.ok ? 'text-green-500' : 'text-red-400'}>
            {result.ok
              ? result.channel === 'chat'
                ? '消息已送达'
                : '已转为邮件发送'
              : '发送未生效'}
          </p>
          <div className="rounded-md bg-muted/40 px-3 py-2 font-mono text-xs break-all">{result.message || '（无回执）'}</div>
        </div>
      )}
    </Dialog>
  );
}
