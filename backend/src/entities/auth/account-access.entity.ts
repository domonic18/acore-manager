import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity({ name: 'account_access', database: 'acore_auth' })
export class AccountAccess {
  @PrimaryColumn({ name: 'id' })
  accountId!: number;

  @PrimaryColumn({ name: 'gmlevel' })
  gmlevel!: number;

  @PrimaryColumn({ name: 'RealmID' })
  realmId!: number;

  @Column({ name: 'comment', nullable: true })
  comment?: string;
}
