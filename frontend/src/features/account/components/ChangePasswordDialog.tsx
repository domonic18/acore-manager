import { useEffect, useState } from 'react';
import { Dialog } from '@/shared/components/Dialog';

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
  username: string;
  pending: boolean;
  onSubmit: (password: string) => void;
}

export function ChangePasswordDialog({ open, onClose, username, pending, onSubmit }: ChangePasswordDialogProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const passwordsMatch = newPassword.length >= 4 && newPassword === confirmPassword;

  useEffect(() => {
    if (open) {
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="更改密码"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
          >
            取消
          </button>
          <button
            onClick={() => passwordsMatch && onSubmit(newPassword)}
            disabled={!passwordsMatch || pending}
            className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? '处理中...' : '确认更改'}
          </button>
        </>
      }
    >
      <div className="bg-muted/50 rounded-md p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">目标账号</span>
          <span className="font-medium">{username}</span>
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
  );
}
