import { QueryRunner } from 'typeorm';
import { authDataSource } from '../config/database';
import { RbacLinkedPermission } from '../entities/auth/rbac-linked-permissions.entity';
import { RbacPermission } from '../entities/auth/rbac-permissions.entity';

export interface RbacRole {
  id: number;
  secId: number;
  name: string;
}

export class RbacRepository {
  async getRoles(): Promise<RbacRole[]> {
    const rows = await authDataSource.query(
      `SELECT d.secId, d.permissionId AS id, p.name
       FROM rbac_default_permissions d
       JOIN rbac_permissions p ON p.id = d.permissionId
       ORDER BY d.secId, d.permissionId`,
    );
    return rows.map((row: any) => ({
      id: Number(row.id),
      secId: Number(row.secId),
      name: String(row.name),
    }));
  }

  async getPermissions(): Promise<RbacPermission[]> {
    const repository = authDataSource.getRepository(RbacPermission);
    return repository.find({ order: { id: 'ASC' } });
  }

  async getLinkedPermissionIds(roleId: number): Promise<number[]> {
    const repository = authDataSource.getRepository(RbacLinkedPermission);
    const links = await repository.find({ where: { roleId } });
    return links.map((link) => link.permissionId);
  }

  async linkPermission(
    roleId: number,
    permissionId: number,
    queryRunner?: QueryRunner,
  ): Promise<void> {
    const runner = queryRunner || authDataSource.createQueryRunner();
    const isOwner = !queryRunner;

    try {
      if (isOwner) {
        await runner.connect();
      }
      await runner.query(
        `INSERT IGNORE INTO rbac_linked_permissions (id, linkedId) VALUES (?, ?)`,
        [roleId, permissionId],
      );
    } finally {
      if (isOwner) {
        await runner.release();
      }
    }
  }

  async unlinkPermission(
    roleId: number,
    permissionId: number,
    queryRunner?: QueryRunner,
  ): Promise<void> {
    const runner = queryRunner || authDataSource.createQueryRunner();
    const isOwner = !queryRunner;

    try {
      if (isOwner) {
        await runner.connect();
      }
      await runner.query(
        `DELETE FROM rbac_linked_permissions WHERE id = ? AND linkedId = ?`,
        [roleId, permissionId],
      );
    } finally {
      if (isOwner) {
        await runner.release();
      }
    }
  }
}

export const rbacRepository = new RbacRepository();
