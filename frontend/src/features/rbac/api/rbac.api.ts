import { apiClient } from '@/shared/api/client';

export interface RbacRole {
  id: number;
  secId: number;
  name: string;
}

export interface RbacPermission {
  id: number;
  name: string;
  label?: string;
  desc?: string;
  category?: string;
  editable: boolean;
}

export const rbacApi = {
  getRoles: () => apiClient.get<RbacRole[]>('/api/rbac/roles'),
  getPermissions: () => apiClient.get<RbacPermission[]>('/api/rbac/permissions'),
  getRolePermissions: (roleId: number) =>
    apiClient.get<number[]>(`/api/rbac/roles/${roleId}/permissions`),
  updateRolePermissions: (roleId: number, permissionIds: number[]) =>
    apiClient.post<{ success: boolean }>(`/api/rbac/roles/${roleId}/permissions`, { permissionIds }),
};
