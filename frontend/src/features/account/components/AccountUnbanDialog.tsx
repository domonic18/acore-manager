import { ConfirmDialog } from '@/shared/components/ConfirmDialog';

interface AccountUnbanDialogProps {
  open: boolean;
  onClose: () => void;
  username: string;
  pending: boolean;
  onConfirm: () => void;
}

export function AccountUnbanDialog({ open, onClose, username, pending, onConfirm }: AccountUnbanDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="确认解禁"
      tone="success"
      confirmText="确认解禁"
      pending={pending}
      onConfirm={onConfirm}
    >
      <div className="text-sm text-muted-foreground mb-4">
        确认要解禁账号 <span className="font-medium text-foreground">{username}</span> 吗？
      </div>
    </ConfirmDialog>
  );
}
