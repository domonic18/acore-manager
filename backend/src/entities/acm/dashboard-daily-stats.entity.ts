import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'dashboard_daily_stats' })
export class DashboardDailyStats {
  @PrimaryColumn({ type: 'date', name: 'stat_date' })
  statDate!: string;

  @Column({ type: 'int', name: 'new_accounts', default: 0 })
  newAccounts!: number;

  @Column({ type: 'int', nullable: true, name: 'active_accounts' })
  activeAccounts!: number | null;

  @Column({ type: 'int', nullable: true, name: 'peak_online' })
  peakOnline!: number | null;

  @Column({ type: 'int', default: 0 })
  bans!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
