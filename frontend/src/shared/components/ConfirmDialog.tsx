import type { ReactNode } from 'react';
import { Dialog } from './Dialog';

// 取消/确认按钮对的统一封装：tone 覆盖各页现有确认按钮配色
// （封禁 red / 禁言 amber / 解禁 green、emerald / 通用 primary）
const CONFIRM_TONES = {
  danger: 'bg-red-600 hover:bg-red-700',
  success: 'bg-green-600 hover:bg-green-700',
  emerald: 'bg-emerald-600 hover:bg-emerald-700',
  warning: 'bg-amber-600 hover:bg-amber-700',
  primary: 'bg-primary hover:bg-primary/90',
} as const;

export type ConfirmTone = keyof typeof CONFIRM_TONES;

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
  pending?: boolean;
  pendingText?: string;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  children,
  confirmText = '确认',
  cancelText = '取消',
  tone = 'danger',
  pending = false,
  pendingText = '处理中...',
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className={`px-4 py-2 rounded-md text-white text-sm font-medium disabled:opacity-50 ${CONFIRM_TONES[tone]}`}
          >
            {pending ? pendingText : confirmText}
          </button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
