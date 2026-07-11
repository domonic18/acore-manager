import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity({ name: 'rbac_permissions', database: 'acore_auth' })
export class RbacPermission {
  @PrimaryColumn({ name: 'id' })
  id!: number;

  @Column({ name: 'name' })
  name!: string;
}
