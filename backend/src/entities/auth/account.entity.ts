import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'account', database: 'acore_auth' })
export class Account {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  username!: string;

  @Column({ name: 'sha_pass_hash' })
  shaPassHash!: string;

  @Column({ name: 'session_key', nullable: true })
  sessionKey?: string;

  @Column({ name: 'v', nullable: true })
  v?: string;

  @Column({ name: 's', nullable: true })
  s?: string;

  @Column({ name: 'token_key', nullable: true })
  tokenKey?: string;

  @Column({ name: 'email', nullable: true })
  email?: string;

  @Column({ name: 'reg_mail', nullable: true })
  regMail?: string;

  @Column({ name: 'joindate' })
  joinDate!: Date;

  @Column({ name: 'last_ip', nullable: true })
  lastIp?: string;

  @Column({ name: 'last_attempt_ip', nullable: true })
  lastAttemptIp?: string;

  @Column({ name: 'failed_logins', default: 0 })
  failedLogins!: number;

  @Column({ name: 'locked', default: 0 })
  locked!: number;

  @Column({ name: 'lock_country', nullable: true })
  lockCountry?: string;

  @Column({ name: 'last_login', nullable: true })
  lastLogin?: Date;

  @Column({ name: 'online', default: 0 })
  online!: number;

  @Column({ name: 'expansion', default: 2 })
  expansion!: number;

  @Column({ name: 'mutetime', default: 0 })
  muteTime!: number;

  @Column({ name: 'mutereason', nullable: true })
  muteReason?: string;

  @Column({ name: 'muteby', nullable: true })
  muteBy?: string;

  @Column({ name: 'locale', default: 0 })
  locale!: number;

  @Column({ name: 'os', nullable: true })
  os?: string;

  @Column({ name: 'recruiter', default: 0 })
  recruiter!: number;

  @Column({ name: 'totaltime', default: 0 })
  totalTime!: number;
}
