import { useEffect, useMemo, useState } from 'react';
import {
  useRbacRoles,
  useRbacPermissions,
  useRolePermissions,
  useUpdateRolePermissions,
} from '@/features/rbac/hooks/useRbac';
import { RbacPermission } from '@/features/rbac/api/rbac.api';
import {
  RBAC_TOGGLE_CONFIRM_CLOSED,
  type RbacToggleConfirmState,
} from '@/features/rbac/components/RbacToggleConfirmDialog';
import { toast } from '@/shared/utils/toast.util';

const DEFAULT_ROLE_ID = 195;

const FOCUSED_PERMISSION_IDS = [24, 25, 26, 27, 28, 29, 51];

export function useRbacConfig() {
  const [selectedRoleId, setSelectedRoleId] = useState<number>(DEFAULT_ROLE_ID);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<number>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<RbacToggleConfirmState>(RBAC_TOGGLE_CONFIRM_CLOSED);

  const rolesQuery = useRbacRoles();
  const permissionsQuery = useRbacPermissions();
  const rolePermissionsQuery = useRolePermissions(selectedRoleId);
  const updateMutation = useUpdateRolePermissions();

  useEffect(() => {
    if (rolePermissionsQuery.data) {
      setSelectedPermissionIds(new Set(rolePermissionsQuery.data));
    }
  }, [rolePermissionsQuery.data]);

  const { focusedByCategory, others } = useMemo(() => {
    const focusedMap = new Map<string, RbacPermission[]>();
    const othersList: RbacPermission[] = [];
    const permissions = permissionsQuery.data || [];

    for (const permission of permissions) {
      if (FOCUSED_PERMISSION_IDS.includes(permission.id)) {
        const category = permission.category || '其他';
        if (!focusedMap.has(category)) {
          focusedMap.set(category, []);
        }
        focusedMap.get(category)!.push(permission);
      } else {
        othersList.push(permission);
      }
    }

    const focusedByCategorySorted = Array.from(focusedMap.entries()).sort(([a], [b]) =>
      a.localeCompare(b, 'zh-CN'),
    );

    return { focusedByCategory: focusedByCategorySorted, others: othersList };
  }, [permissionsQuery.data]);

  const handleToggle = (permission: RbacPermission) => {
    if (!permission.editable) {
      return;
    }

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
    setConfirmDialog(RBAC_TOGGLE_CONFIRM_CLOSED);
  };

  const handleCancel = () => {
    setConfirmDialog(RBAC_TOGGLE_CONFIRM_CLOSED);
  };

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

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        roleId: selectedRoleId,
        permissionIds: Array.from(selectedPermissionIds).filter((id) =>
          FOCUSED_PERMISSION_IDS.includes(id),
        ),
      });
      toast.success('RBAC 权限已保存并已热加载');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    }
  };

  return {
    selectedRoleId,
    setSelectedRoleId,
    roles: rolesQuery.data,
    rolesLoading: rolesQuery.isLoading,
    isLoading:
      rolesQuery.isLoading || permissionsQuery.isLoading || rolePermissionsQuery.isLoading,
    focusedByCategory,
    others,
    selectedPermissionIds,
    confirmDialog,
    handleToggle,
    handleConfirm,
    handleCancel,
    handleSave,
    savePending: updateMutation.isPending,
  };
}
