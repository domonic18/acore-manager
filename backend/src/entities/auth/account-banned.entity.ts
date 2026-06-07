import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity({ name: 'account_banned', database: 'acore_auth' })
export class AccountBanned {
  @PrimaryColumn({ name: 'id' })
  accountId!: number;

  @PrimaryColumn({ name: 'bandate' })
  banDate!: Date;

  @Column({ name: 'unbandate' })
  unbanDate!: Date;

  @Column({ name: 'bannedby' })
  bannedBy!: string;

  @Column({ name: 'banreason' })
  banReason!: string;

  @Column({ name: 'active', default: 1 })
  active!: number;
}
