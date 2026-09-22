import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AiChatSession } from './ai-chat-session.entity';

@Entity({ name: 'ai_chat_message' })
@Index('idx_ai_chat_message_session', ['sessionId', 'id'])
export class AiChatMessage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', name: 'session_id' })
  sessionId!: number;

  @ManyToOne(() => AiChatSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: AiChatSession;

  @Column({ type: 'varchar', length: 20 })
  role!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'tool_name' })
  toolName!: string | null;

  @Column({ type: 'jsonb', nullable: true, name: 'tool_args_json' })
  toolArgsJson!: Record<string, any> | null;

  @Column({ type: 'int', nullable: true })
  tokens!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
