import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'ai_chat_session' })
@Index('idx_ai_chat_session_user', ['userId', 'lastActiveAt'])
export class AiChatSession {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', name: 'user_id' })
  userId!: number;

  @Column({ type: 'varchar', length: 64, name: 'thread_id' })
  threadId!: string;

  @Column({ type: 'varchar', length: 200, default: '' })
  title!: string;

  @Column({ type: 'varchar', length: 32, default: '' })
  realm!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'timestamp', name: 'last_active_at', default: () => 'CURRENT_TIMESTAMP' })
  lastActiveAt!: Date;
}
