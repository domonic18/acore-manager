import { Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'rbac_linked_permissions', database: 'acore_auth' })
export class RbacLinkedPermission {
  @PrimaryColumn({ name: 'id' })
  roleId!: number;

  @PrimaryColumn({ name: 'linkedId' })
  permissionId!: number;
}
