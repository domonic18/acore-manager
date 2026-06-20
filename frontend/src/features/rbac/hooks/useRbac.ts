import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rbacApi } from '../api/rbac.api';

export function useRbacRoles() {
  return useQuery({
    queryKey: ['rbac', 'roles'],
    queryFn: () => rbacApi.getRoles(),
  });
}

export function useRbacPermissions() {
  return useQuery({
    queryKey: ['rbac', 'permissions'],
    queryFn: () => rbacApi.getPermissions(),
  });
}

export function useRolePermissions(roleId: number) {
  return useQuery({
    queryKey: ['rbac', 'role-permissions', roleId],
    queryFn: () => rbacApi.getRolePermissions(roleId),
    enabled: roleId > 0,
  });
}

export function useUpdateRolePermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ roleId, permissionIds }: { roleId: number; permissionIds: number[] }) =>
      rbacApi.updateRolePermissions(roleId, permissionIds),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rbac', 'role-permissions', variables.roleId] });
    },
  });
}
