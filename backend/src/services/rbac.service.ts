import { auditLogService } from './audit-log.service';
import { soapService } from './soap.service';
import { rbacRepository, RbacRole } from '../repositories/rbac.repository';
import { RbacPermission } from '../entities/auth/rbac-permissions.entity';
import { authDataSource } from '../config/database';

export const RBAC_PERMISSION_LABELS: Record<number, { label: string; desc: string; category: string }> = {
  24: { label: '双阵营角色创建', desc: '允许同一账号创建联盟和部落角色', category: '账号' },
  25: { label: '跨阵营基础聊天', desc: '允许 say/yell 等近距离聊天跨阵营可见', category: '聊天' },
  26: { label: '跨阵营频道', desc: '允许自定义聊天频道跨阵营互通', category: '聊天' },
  27: { label: '跨阵营邮件', desc: '允许跨阵营发送邮件', category: '社交' },
  28: { label: '跨阵营 /who', desc: '/who 列表显示对方阵营玩家', category: '社交' },
  29: { label: '跨阵营加好友', desc: '允许添加对方阵营玩家为好友', category: '社交' },
  51: { label: '跨阵营交易', desc: '允许与对方阵营玩家进行交易', category: '社交' },
};

const ALLOWED_PERMISSION_IDS = new Set(Object.keys(RBAC_PERMISSION_LABELS).map(Number));

export interface RbacPermissionView extends RbacPermission {
  label?: string;
  desc?: string;
  category?: string;
  editable: boolean;
}

export class RbacService {
  async listRoles(): Promise<RbacRole[]> {
    return rbacRepository.getRoles();
  }

  async listPermissions(): Promise<RbacPermissionView[]> {
    const permissions = await rbacRepository.getPermissions();
    return permissions.map((permission) => {
      const meta = RBAC_PERMISSION_LABELS[permission.id];
      return {
        ...permission,
        label: meta?.label,
        desc: meta?.desc,
        category: meta?.category,
        editable: ALLOWED_PERMISSION_IDS.has(permission.id),
      };
    });
  }

  async getRolePermissions(roleId: number): Promise<number[]> {
    return rbacRepository.getLinkedPermissionIds(roleId);
  }

  async updateRolePermissions(
    roleId: number,
    wantedPermissionIds: number[],
    operatorId: number,
    operatorName: string,
  ): Promise<void> {
    const wanted = new Set(wantedPermissionIds.filter((id) => ALLOWED_PERMISSION_IDS.has(id)));
    const currentAll = new Set(await rbacRepository.getLinkedPermissionIds(roleId));
    const currentEditable = new Set(
      [...currentAll].filter((id) => ALLOWED_PERMISSION_IDS.has(id)),
    );

    const added: number[] = [];
    const removed: number[] = [];

    for (const id of wanted) {
      if (!currentAll.has(id)) {
        added.push(id);
      }
    }

    for (const id of currentEditable) {
      if (!wanted.has(id)) {
        removed.push(id);
      }
    }

    const queryRunner = authDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const permissionId of added) {
        await rbacRepository.linkPermission(roleId, permissionId, queryRunner);
      }

      for (const permissionId of removed) {
        await rbacRepository.unlinkPermission(roleId, permissionId, queryRunner);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    await soapService.sendCommand('.reload rbac');

    await auditLogService.record({
      operatorId,
      operatorName,
      operation: 'RBAC_PERMISSION_UPDATE',
      target: `rbac_role:${roleId}`,
      details: JSON.stringify({ added, removed }),
    });
  }
}

export const rbacService = new RbacService();
