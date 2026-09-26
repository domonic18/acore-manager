import { useRbacConfig } from '@/features/rbac/hooks/useRbacConfig';
import { RbacPermissionGroups } from '@/features/rbac/components/RbacPermissionGroups';
import { RbacToggleConfirmDialog } from '@/features/rbac/components/RbacToggleConfirmDialog';

export default function RbacConfigPage() {
  const config = useRbacConfig();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">RBAC 权限配置</h1>
          <p className="text-sm text-muted-foreground mt-1">
            跨阵营权限可直接设置，其他权限仅可查看，避免误操作。
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="role-select" className="text-sm font-medium whitespace-nowrap">
            选择角色
          </label>
          <select
            id="role-select"
            value={config.selectedRoleId}
            onChange={(e) => config.setSelectedRoleId(Number(e.target.value))}
            disabled={config.rolesLoading}
            className="min-w-[200px] px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {config.roles?.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name} ({role.id}) [secId: {role.secId}]
              </option>
            ))}
          </select>
        </div>
      </div>

      {config.isLoading ? (
        <div className="text-center py-12 text-muted-foreground">加载中...</div>
      ) : (
        <>
          <RbacPermissionGroups
            focusedByCategory={config.focusedByCategory}
            others={config.others}
            selectedIds={config.selectedPermissionIds}
            onToggle={config.handleToggle}
          />

          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-muted-foreground">
              已选择 {config.selectedPermissionIds.size} 项权限
            </p>
            <button
              onClick={config.handleSave}
              disabled={config.savePending}
              className="py-2 px-6 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {config.savePending ? '保存中...' : '保存权限'}
            </button>
          </div>
        </>
      )}

      <RbacToggleConfirmDialog
        state={config.confirmDialog}
        onCancel={config.handleCancel}
        onConfirm={config.handleConfirm}
      />
    </div>
  );
}
