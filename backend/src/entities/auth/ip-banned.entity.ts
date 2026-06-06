import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity({ name: 'ip_banned', database: 'acore_auth' })
export class IpBanned {
  @PrimaryColumn({ name: 'ip' })
  ip!: string;

  @PrimaryColumn({ name: 'bandate' })
  banDate!: Date;

  @Column({ name: 'unbandate' })
  unbanDate!: Date;

  @Column({ name: 'bannedby' })
  bannedBy!: string;

  @Column({ name: 'banreason' })
  banReason!: string;
}
