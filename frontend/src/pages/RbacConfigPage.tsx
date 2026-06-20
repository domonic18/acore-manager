import { useEffect, useMemo, useState } from 'react';
import {
  useRbacRoles,
  useRbacPermissions,
  useRolePermissions,
  useUpdateRolePermissions,
} from '@/features/rbac/hooks/useRbac';
import { RbacPermission } from '@/features/rbac/api/rbac.api';
import { Dialog } from '@/shared/components/Dialog';
import { toast } from '@/shared/utils/toast.util';

const DEFAULT_ROLE_ID = 195;

interface ConfirmDialogState {
  open: boolean;
  permission: RbacPermission | null;
  willBeChecked: boolean;
}

export default function RbacConfigPage() {
  const [selectedRoleId, setSelectedRoleId] = useState<number>(DEFAULT_ROLE_ID);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<number>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    open: false,
    permission: null,
    willBeChecked: false,
  });

  const rolesQuery = useRbacRoles();
  const permissionsQuery = useRbacPermissions();
  const rolePermissionsQuery = useRolePermissions(selectedRoleId);
  const updateMutation = useUpdateRolePermissions();

  useEffect(() => {
    if (rolePermissionsQuery.data) {
      setSelectedPermissionIds(new Set(rolePermissionsQuery.data));
    }
  }, [rolePermissionsQuery.data]);

  const focusedByCategory = useMemo(() => {
    const focusedMap = new Map<string, RbacPermission[]>();
    const permissions = permissionsQuery.data || [];

    for (const permission of permissions) {
      const category = permission.category || '其他';
      if (!focusedMap.has(category)) {
        focusedMap.set(category, []);
      }
      focusedMap.get(category)!.push(permission);
    }

    return Array.from(focusedMap.entries()).sort(([a], [b]) =>
      a.localeCompare(b, 'zh-CN'),
    );
  }, [permissionsQuery.data]);

  const applyToggle = (permissionId: number) => {
    setSelectedPermissionIds((prev) => {
      const next = new Set(prev);
      if (next.has(permissionId)) {
        next.delete(permissionId);
      } else {
        next.add(permissionId);
      }
      return next;
    });
  };

  const handleToggle = (permission: RbacPermission) => {
    setConfirmDialog({
      open: true,
      permission,
      willBeChecked: !selectedPermissionIds.has(permission.id),
    });
  };

  const handleConfirm = () => {
    if (confirmDialog.permission) {
      applyToggle(confirmDialog.permission.id);
    }
    setConfirmDialog({ open: false, permission: null, willBeChecked: false });
  };

  const handleCancel = () => {
    setConfirmDialog({ open: false, permission: null, willBeChecked: false });
  };

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        roleId: selectedRoleId,
        permissionIds: Array.from(selectedPermissionIds),
      });
      toast.success('RBAC 权限已保存并已热加载');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    }
  };

  const isLoading =
    rolesQuery.isLoading || permissionsQuery.isLoading || rolePermissionsQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">跨阵营交互配置</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理玩家默认角色的跨阵营交互权限，保存后会自动执行 .reload rbac 热加载。
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="role-select" className="text-sm font-medium whitespace-nowrap">
            选择角色
          </label>
          <select
            id="role-select"
            value={selectedRoleId}
            onChange={(e) => setSelectedRoleId(Number(e.target.value))}
            disabled={rolesQuery.isLoading}
            className="min-w-[200px] px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {rolesQuery.data?.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name} ({role.id}) [secId: {role.secId}]
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">加载中...</div>
      ) : (
        <>
          <div className="grid gap-6">
            {focusedByCategory.map(([category, permissions]) => (
              <div
                key={category}
                className="rounded-lg border border-border bg-card p-5 space-y-4"
              >
                <h2 className="text-lg font-semibold border-b border-border pb-2">{category}</h2>
                <div className="space-y-3">
                  {permissions.map((permission) => (
                    <PermissionRow
                      key={permission.id}
                      permission={permission}
                      checked={selectedPermissionIds.has(permission.id)}
                      onToggle={() => handleToggle(permission)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-muted-foreground">
              已选择 {selectedPermissionIds.size} 项权限
            </p>
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="py-2 px-6 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {updateMutation.isPending ? '保存中...' : '保存权限'}
            </button>
          </div>
        </>
      )}

      <Dialog
        open={confirmDialog.open}
        onClose={handleCancel}
        title="确认修改权限"
        footer={
          <>
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-accent transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              确认
            </button>
          </>
        }
      >
        {confirmDialog.permission && (
          <div className="space-y-2">
            <p className="text-sm">
              你确定要
              <span className="font-semibold text-primary">
                {confirmDialog.willBeChecked ? '启用' : '禁用'}
              </span>
              以下权限吗？
            </p>
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">{confirmDialog.permission.label || confirmDialog.permission.name}</p>
              {confirmDialog.permission.desc && (
                <p className="text-muted-foreground mt-1">{confirmDialog.permission.desc}</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">权限 ID: {confirmDialog.permission.id}</p>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function PermissionRow({
  permission,
  checked,
  onToggle,
}: {
  permission: RbacPermission;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-start gap-3 p-3 rounded-md hover:bg-accent/50 cursor-pointer transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-ring"
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{permission.label || permission.name}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            ID: {permission.id}
          </span>
        </div>
        {permission.desc && (
          <p className="text-sm text-muted-foreground mt-0.5">{permission.desc}</p>
        )}
      </div>
    </label>
  );
}
