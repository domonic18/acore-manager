import { ConfirmDialog } from '@/shared/components/ConfirmDialog';

interface CharacterUnmuteConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  characterName: string;
  pending: boolean;
  onConfirm: () => void;
}

export function CharacterUnmuteConfirmDialog({
  open,
  onClose,
  characterName,
  pending,
  onConfirm,
}: CharacterUnmuteConfirmDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="确认解除禁言"
      tone="emerald"
      confirmText="确认解除"
      pending={pending}
      onConfirm={onConfirm}
    >
      <div className="text-sm text-muted-foreground">
        确认要解除角色 <span className="font-medium text-foreground">{characterName}</span> 的聊天禁言吗？
      </div>
    </ConfirmDialog>
  );
}
