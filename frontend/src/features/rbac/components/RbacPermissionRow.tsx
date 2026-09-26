import { RbacPermission } from '@/features/rbac/api/rbac.api';

export function RbacPermissionRow({
  permission,
  checked,
  onToggle,
}: {
  permission: RbacPermission;
  checked: boolean;
  onToggle: () => void;
}) {
  const disabled = !permission.editable;

  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-md transition-colors ${
        disabled
          ? 'cursor-not-allowed opacity-70'
          : 'hover:bg-accent/50 cursor-pointer'
      }`}
      title={disabled ? '该权限仅可查看，不可修改' : undefined}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={disabled}
        className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-ring disabled:cursor-not-allowed"
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{permission.label || permission.name}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            ID: {permission.id}
          </span>
          {disabled && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              只读
            </span>
          )}
        </div>
        {permission.desc && (
          <p className="text-sm text-muted-foreground mt-0.5">{permission.desc}</p>
        )}
      </div>
    </label>
  );
}
