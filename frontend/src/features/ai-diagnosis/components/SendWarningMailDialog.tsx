import { useEffect, useState } from 'react';
import { Dialog } from '@/shared/components/Dialog';
import { toast } from '@/shared/utils/toast.util';
import type { MailTargetResult } from '@/shared/api/gm-mail';
import { useMailTemplate, useSendWarningMail } from '../hooks/useAiDiagnosis';
import type { MarkFalsePositiveTarget } from './MarkFalsePositiveDialog';

// 一键警告邮件弹窗（T4.5，需求 3.10）：自动载入警告模板，GM 编辑后二次确认发送，
// 逐目标反馈成功/失败。编辑的是含 {player} 占位符的模板文本，预览按第一个目标渲染。

export interface SendWarningMailDialogProps {
  targets: MarkFalsePositiveTarget[];
  reason: string;
  reportDate: string;
  refReport: string;
  open: boolean;
  onClose: () => void;
}

type Phase = 'edit' | 'confirm' | 'result';

function renderPreview(text: string, player: string, reason: string, date: string): string {
  return text.replace(/\{player\}/g, player).replace(/\{reason\}/g, reason).replace(/\{date\}/g, date);
}

export function SendWarningMailDialog({ targets, reason, reportDate, refReport, open, onClose }: SendWarningMailDialogProps) {
  const { data: template } = useMailTemplate(open);
  const sendMail = useSendWarningMail();
  const [phase, setPhase] = useState<Phase>('edit');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [results, setResults] = useState<MailTargetResult[]>([]);

  useEffect(() => {
    if (open) {
      setPhase('edit');
      setResults([]);
      setSubject(template?.subject ?? '');
      setBody(template?.body ?? '');
    }
  }, [open, template]);

  const previewName = targets[0]?.name ?? '';
  const previewBody = renderPreview(body, previewName, reason, reportDate);
  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;

  const handleSubmit = (): void => {
    sendMail.mutate(
      { targets: targets.map((t) => t.name), subject, body, source: 'custom', refReport },
      {
        onSuccess: (data) => {
          setResults(data.results);
          setPhase('result');
          if (data.results.every((r) => r.ok)) toast.success('警告邮件已发送');
          else toast.error('部分目标发送失败，请查看结果');
        },
        onError: (err: Error) => toast.error(err.message || '发送失败'),
      },
    );
  };

  const footer =
    phase === 'edit' ? (
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
          取消
        </button>
        <button
          onClick={() => setPhase('confirm')}
          disabled={!subject.trim() || !body.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一步
        </button>
      </div>
    ) : phase === 'confirm' ? (
      <div className="flex justify-end gap-2">
        <button onClick={() => setPhase('edit')} disabled={sendMail.isPending} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
          返回编辑
        </button>
        <button
          onClick={handleSubmit}
          disabled={sendMail.isPending}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sendMail.isPending ? '发送中...' : `确认发送给 ${targets.length} 个角色`}
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
    <Dialog open={open} onClose={onClose} title={`发送警告邮件（${targets.length} 个角色）`} footer={footer}>
      {phase === 'edit' && (
        <div className="space-y-3 text-sm">
          <div className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            标题/正文支持占位符：<code className="font-mono">{'{player}'}</code> 角色名、<code className="font-mono">{'{reason}'}</code> 违规原因、
            <code className="font-mono">{'{date}'}</code> 报告日期，发送时逐目标替换。正文不超过 500 字。
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">邮件标题</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={100}
              className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">邮件正文（{body.length}/500）</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 500))}
              rows={5}
              className="w-full resize-none rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <div className="text-xs font-semibold text-muted-foreground">预览（{previewName}）</div>
            <div className="mt-1 text-sm">{previewBody || <span className="text-muted-foreground">（空）</span>}</div>
          </div>
        </div>
      )}

      {phase === 'confirm' && (
        <div className="space-y-3 text-sm">
          <p>确认向以下 {targets.length} 个角色发送警告邮件？发送会记录审计日志。</p>
          <div className="max-h-24 overflow-y-auto rounded-md bg-muted/40 px-3 py-2 font-mono text-xs">
            {targets.map((t) => t.name).join('、')}
          </div>
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <div className="text-xs font-semibold text-muted-foreground">{subject}</div>
            <p className="mt-1">{previewBody}</p>
          </div>
        </div>
      )}

      {phase === 'result' && (
        <div className="space-y-2 text-sm">
          <p>
            发送完成：成功 <span className="font-semibold text-green-500">{okCount}</span> / 失败{' '}
            <span className={`font-semibold ${failCount > 0 ? 'text-red-400' : ''}`}>{failCount}</span>
          </p>
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {results.map((r) => (
              <li key={r.name} className="flex items-start justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs">
                <span className="font-medium">{r.name}</span>
                <span className={`text-right ${r.ok ? 'text-green-500' : 'text-red-400'}`}>
                  {r.ok ? '已受理' : r.message}
                  {r.online != null && <span className="ml-1 text-muted-foreground">（{r.online ? '在线' : '离线'}）</span>}
                </span>
              </li>
            ))}
          </ul>
          {failCount > 0 && <p className="text-xs text-muted-foreground">失败目标可在修正后重试（角色不存在 / 离线不可达等）。</p>}
        </div>
      )}
    </Dialog>
  );
}
