import { useEffect, useState } from 'react';
import { Dialog } from '@/shared/components/Dialog';

// 处置备注编辑弹窗（T4.7）：巡检报告与定向分析记录共用，保存空串即清除备注。

interface RemarkEditDialogProps {
  open: boolean;
  title: string;
  initial: string | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (remark: string) => void;
}

export function RemarkEditDialog({ open, title, initial, pending, onClose, onSubmit }: RemarkEditDialogProps) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (open) setText(initial ?? '');
  }, [open, initial]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
            取消
          </button>
          <button
            onClick={() => onSubmit(text)}
            disabled={pending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? '保存中...' : '保存'}
          </button>
        </div>
      }
    >
      <div className="space-y-2 text-sm">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          rows={4}
          placeholder="记录处置结论、跟进事项等（留空保存即清除备注）"
          className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="text-xs text-muted-foreground">{text.length}/1000，保存动作会记录审计日志</div>
      </div>
    </Dialog>
  );
}
