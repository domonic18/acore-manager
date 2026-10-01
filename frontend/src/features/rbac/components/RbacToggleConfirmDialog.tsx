import { RbacPermission } from '@/features/rbac/api/rbac.api';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';

export interface RbacToggleConfirmState {
  open: boolean;
  permission: RbacPermission | null;
  willBeChecked: boolean;
}

export const RBAC_TOGGLE_CONFIRM_CLOSED: RbacToggleConfirmState = {
  open: false,
  permission: null,
  willBeChecked: false,
};

interface RbacToggleConfirmDialogProps {
  state: RbacToggleConfirmState;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RbacToggleConfirmDialog({ state, onCancel, onConfirm }: RbacToggleConfirmDialogProps) {
  return (
    <ConfirmDialog
      open={state.open}
      onClose={onCancel}
      title="确认修改权限"
      tone="primary"
      confirmText="确认"
      onConfirm={onConfirm}
    >
      {state.permission && (
        <div className="space-y-2">
          <p className="text-sm">
            你确定要
            <span className="font-semibold text-primary">
              {state.willBeChecked ? '启用' : '禁用'}
            </span>
            以下权限吗？
          </p>
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium">{state.permission.label || state.permission.name}</p>
            {state.permission.desc && (
              <p className="text-muted-foreground mt-1">{state.permission.desc}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2">权限 ID: {state.permission.id}</p>
          </div>
        </div>
      )}
    </ConfirmDialog>
  );
}
