import { randomUUID } from 'crypto';
import { acmDataSource } from '@/config/database';
import { AiChatSession } from '@/entities/acm/ai-chat-session.entity';
import { AiChatMessage } from '@/entities/acm/ai-chat-message.entity';
import { deleteThread } from '@/agent/runtime/checkpointer';
import { ServiceError } from '@/shared/errors/service-error';

// 对话正本管理（arch 3.2.3）：acm PG ai_chat_session / ai_chat_message 为会话正本，
// LangGraph checkpoint（PostgresSaver）承载中间状态；删除会话 = 正本行 + checkpoint deleteThread 双清。

export { ServiceError };

export class ChatSessionService {
  async list(userId: number): Promise<AiChatSession[]> {
    return acmDataSource
      .getRepository(AiChatSession)
      .find({ where: { userId }, order: { lastActiveAt: 'DESC' }, take: 100 });
  }

  async create(userId: number, title = '', realm = ''): Promise<AiChatSession> {
    const repo = acmDataSource.getRepository(AiChatSession);
    return repo.save(repo.create({ userId, threadId: randomUUID(), title, realm }));
  }

  async getOwned(userId: number, sessionId: number): Promise<AiChatSession> {
    const session = await acmDataSource.getRepository(AiChatSession).findOne({ where: { id: sessionId, userId } });
    if (!session) throw new ServiceError('会话不存在 / session not found', 404);
    return session;
  }

  async messages(session: AiChatSession): Promise<
    { id: number; role: string; content: string; toolName: string | null; tokens: number | null; createdAt: Date }[]
  > {
    const rows = await acmDataSource
      .getRepository(AiChatMessage)
      .find({ where: { sessionId: session.id }, order: { id: 'ASC' }, take: 200 });
    return rows.map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      toolName: r.toolName,
      tokens: r.tokens,
      createdAt: r.createdAt,
    }));
  }

  /** 每轮结束落正本：user 行在前（id 序即对话序），回写标题与活跃时间，返回 assistant 消息 id */
  async appendRound(session: AiChatSession, userContent: string, assistantContent: string, tokens: number | null): Promise<number> {
    const repo = acmDataSource.getRepository(AiChatMessage);
    await repo.save(repo.create({ sessionId: session.id, role: 'user', content: userContent }));
    const assistant = await repo.save(repo.create({ sessionId: session.id, role: 'assistant', content: assistantContent, tokens }));
    session.lastActiveAt = new Date();
    if (!session.title) session.title = userContent.slice(0, 50);
    await acmDataSource.getRepository(AiChatSession).save(session);
    return assistant.id;
  }

  async remove(session: AiChatSession): Promise<void> {
    await deleteThread(session.threadId);
    await acmDataSource.getRepository(AiChatSession).remove(session);
  }
}

export const chatSessionService = new ChatSessionService();
