import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { RbacPermission } from '@/features/rbac/api/rbac.api';
import { RbacPermissionRow } from '@/features/rbac/components/RbacPermissionRow';

interface RbacPermissionGroupsProps {
  focusedByCategory: [string, RbacPermission[]][];
  others: RbacPermission[];
  selectedIds: Set<number>;
  onToggle: (permission: RbacPermission) => void;
}

export function RbacPermissionGroups({ focusedByCategory, others, selectedIds, onToggle }: RbacPermissionGroupsProps) {
  const [othersExpanded, setOthersExpanded] = useState(false);

  return (
    <div className="grid gap-6">
      {focusedByCategory.map(([category, permissions]) => (
        <div
          key={category}
          className="rounded-lg border border-border bg-card p-5 space-y-4"
        >
          <h2 className="text-lg font-semibold border-b border-border pb-2">{category}</h2>
          <div className="space-y-3">
            {permissions.map((permission) => (
              <RbacPermissionRow
                key={permission.id}
                permission={permission}
                checked={selectedIds.has(permission.id)}
                onToggle={() => onToggle(permission)}
              />
            ))}
          </div>
        </div>
      ))}

      {others.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <button
            onClick={() => setOthersExpanded((prev) => !prev)}
            className="flex items-center justify-between w-full p-5 text-left"
          >
            <span className="text-lg font-semibold">其他权限 ({others.length})</span>
            <span className="text-muted-foreground">
              {othersExpanded ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </span>
          </button>

          {othersExpanded && (
            <div className="px-5 pb-5 space-y-3 border-t border-border pt-4">
              {others.map((permission) => (
                <RbacPermissionRow
                  key={permission.id}
                  permission={permission}
                  checked={selectedIds.has(permission.id)}
                  onToggle={() => onToggle(permission)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
