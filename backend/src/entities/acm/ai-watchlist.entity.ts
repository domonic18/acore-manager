import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** 观察名单条目（acm.ai_watchlist）：黑/白 × 角色/账号两级，巡检与定向分析注入研判 */
@Entity({ name: 'ai_watchlist' })
export class AiWatchlist {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 10, name: 'list_type' })
  listType!: 'white' | 'black';

  @Column({ type: 'varchar', length: 16, name: 'subject_type' })
  subjectType!: 'character' | 'account';

  @Column({ type: 'varchar', length: 100, name: 'subject_name' })
  subjectName!: string;

  @Column({ type: 'varchar', length: 32 })
  realm!: string;

  @Column({ type: 'varchar', length: 500 })
  reason!: string;

  @Column({ type: 'varchar', length: 100, name: 'created_by' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
