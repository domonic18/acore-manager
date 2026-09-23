jest.mock('@/config/database', () => ({
  acmDataSource: { getRepository: jest.fn() },
}));
jest.mock('@/agent/runtime/checkpointer', () => ({
  deleteThread: jest.fn().mockResolvedValue(undefined),
}));

import { acmDataSource } from '@/config/database';
import { deleteThread } from '@/agent/runtime/checkpointer';
import { AiChatSession } from '@/entities/acm/ai-chat-session.entity';
import { ServiceError, chatSessionService } from '@/services/ai/chat-session.service';

const getRepository = acmDataSource.getRepository as jest.Mock;

describe('ChatSessionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('create saves a session with a generated threadId', async () => {
    const created = { id: 1, userId: 7, threadId: 'generated', title: '', realm: '' };
    const repo = {
      create: jest.fn().mockReturnValue(created),
      save: jest.fn().mockResolvedValue(created),
    };
    getRepository.mockReturnValue(repo);

    const result = await chatSessionService.create(7, '标题', 'realm3');

    expect(result).toEqual(created);
    const arg = repo.create.mock.calls[0][0] as { threadId: string; userId: number; title: string };
    expect(arg.userId).toBe(7);
    expect(arg.title).toBe('标题');
    expect(arg.threadId).toMatch(/[0-9a-f-]{36}/);
  });

  it('getOwned throws 404 when the session belongs to another user', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue(null) };
    getRepository.mockReturnValue(repo);

    const promise = chatSessionService.getOwned(7, 99);
    await expect(promise).rejects.toBeInstanceOf(ServiceError);
    await expect(promise).rejects.toMatchObject({ status: 404 });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 99, userId: 7 } });
  });

  it('appendRound persists user then assistant, sets title and touch time', async () => {
    const session = { id: 5, threadId: 't', userId: 7, title: '', lastActiveAt: new Date('2026-01-01') } as AiChatSession;
    const msgRepo = {
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation(async (v) => ({ ...v, id: v.role === 'user' ? 11 : 12 })),
    };
    const sessionRepo = { save: jest.fn().mockResolvedValue(undefined) };
    getRepository.mockImplementation((entity: { name: string }) => (entity.name === 'AiChatMessage' ? msgRepo : sessionRepo));

    const messageId = await chatSessionService.appendRound(session, '帮我查外挂', '好的', 123);

    expect(messageId).toBe(12);
    expect(msgRepo.save).toHaveBeenCalledTimes(2);
    expect(msgRepo.save.mock.calls[0][0]).toMatchObject({ role: 'user', content: '帮我查外挂' });
    expect(msgRepo.save.mock.calls[1][0]).toMatchObject({ role: 'assistant', content: '好的', tokens: 123 });
    expect(session.title).toBe('帮我查外挂');
  });

  it('appendRound keeps an existing title', async () => {
    const session = { id: 5, threadId: 't', userId: 7, title: '已有标题', lastActiveAt: new Date() } as AiChatSession;
    const msgRepo = {
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation(async (v) => ({ ...v, id: 1 })),
    };
    const sessionRepo = { save: jest.fn().mockResolvedValue(undefined) };
    getRepository.mockImplementation((entity: { name: string }) => (entity.name === 'AiChatMessage' ? msgRepo : sessionRepo));

    await chatSessionService.appendRound(session, '第二轮提问', '回答', null);
    expect(session.title).toBe('已有标题');
  });

  it('remove clears both the checkpoint thread and the session row', async () => {
    const session = { id: 5, threadId: 'thread-abc', userId: 7 } as AiChatSession;
    const repo = { remove: jest.fn().mockResolvedValue(undefined) };
    getRepository.mockReturnValue(repo);

    await chatSessionService.remove(session);

    expect(deleteThread).toHaveBeenCalledWith('thread-abc');
    expect(repo.remove).toHaveBeenCalledWith(session);
  });
});
