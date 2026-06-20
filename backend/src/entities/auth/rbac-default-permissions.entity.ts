import { Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'rbac_default_permissions', database: 'acore_auth' })
export class RbacDefaultPermission {
  @PrimaryColumn({ name: 'secId' })
  secId!: number;

  @PrimaryColumn({ name: 'permissionId' })
  permissionId!: number;
}
