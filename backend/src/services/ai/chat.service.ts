import { HumanMessage } from '@langchain/core/messages';
import { env } from '@/config/env';
import { readRuntimeNumber, SYSTEM_CONFIG_KEYS } from '@/config/system-config.reader';
import { logger } from '@/middleware/request-logger';
import { llmConfigService } from '@/services/ai/llm-config.service';
import { chatSessionService } from '@/services/ai/chat-session.service';
import { tokenUsageService } from '@/services/ai/token-usage.service';
import { getAgent } from '@/agent/runtime/agent-factory';
import { BudgetGuard } from '@/agent/runtime/budget-guard';
import { streamAgentEvents } from '@/agent/runtime/wire';

// GM 助手单轮对话编排（自 ai-assistant.routes 下沉，routes 只留校验与 SSE/JSON 序列化）：
// 会话归属校验 → 默认模型解析 → agent 组装（per-task 预算随 configurable 下发）→ 事件流。
// done 事件在此前完成会话正本 appendRound（失败降级 messageId=null）与 token 计量。

export interface AgentEventLike {
  event: string;
  data: Record<string, unknown>;
}

export interface RoundTokens {
  prompt: number;
  completion: number;
  total: number;
}

export interface CollectedRound {
  sessionId: number;
  messageId: number | null;
  reply: string;
  tokens: RoundTokens;
}

export interface PreparedRound {
  sessionId: number;
  events: AsyncGenerator<AgentEventLike>;
}

function roundTokens(ev: AgentEventLike): RoundTokens {
  const t = (ev.data.tokens ?? {}) as Partial<RoundTokens>;
  return { prompt: t.prompt ?? 0, completion: t.completion ?? 0, total: t.total ?? 0 };
}

class ChatService {
  /**
   * 预检与流生成解耦：调用方先 await 本方法，归属/模型/agent 任一失败可干净回 HTTP 错误
   * （SSE 头尚未写出）；再消费返回的 events 写流。
   * mergeQuestion：question 事件文本是否并入回复正本（appendRound 内容）。
   * 非流式降级为 true（与历史行为一致，AI 提问随回复落正本）；SSE 流为 false。
   */
  async prepareRound(userId: number, sessionId: number, message: string, options: { mergeQuestion?: boolean } = {}): Promise<PreparedRound> {
    const mergeQuestion = options.mergeQuestion ?? false;
    const session = await chatSessionService.getOwned(userId, sessionId);
    const cfg = await llmConfigService.resolveDefault();
    const agent = await getAgent(cfg, 'assistant');
    const startedAt = Date.now();
    const input = { messages: [new HumanMessage(message)] };
    const config = {
      configurable: {
        thread_id: session.threadId,
        budget: new BudgetGuard(await readRuntimeNumber(SYSTEM_CONFIG_KEYS.aiToolCallBudget, env.AI_TOOL_CALL_BUDGET)),
        refId: session.threadId,
      },
    };
    const recordUsage = this.recordUsage.bind(this);

    async function* events(): AsyncGenerator<AgentEventLike> {
      let reply = '';
      let tokens: RoundTokens;
      for await (const ev of streamAgentEvents(agent, input, config)) {
        if (ev.event === 'delta') {
          reply += String(ev.data.text ?? '');
          yield ev;
          continue;
        }
        if (ev.event === 'question') {
          if (mergeQuestion) {
            const q = ev.data as { question?: string; options?: { label?: string }[] };
            const opts = (q.options ?? []).map((o) => o.label).join(' / ');
            reply += `\n\n[AI 提问] ${q.question ?? ''}${opts ? `\n选项：${opts}` : ''}`;
          }
          yield ev;
          continue;
        }
        if (ev.event === 'done') {
          tokens = roundTokens(ev);
          let messageId: number | null = null;
          try {
            messageId = await chatSessionService.appendRound(session, message, reply, tokens.total || null);
          } catch (err) {
            logger.error(`[ai-assistant] append round failed: ${(err as Error).message}`);
          }
          void recordUsage(cfg.modelName, session.threadId, tokens, startedAt);
          yield { event: 'done', data: { sessionId: session.id, messageId, tokens } };
          continue;
        }
        yield ev;
      }
    }

    return { sessionId: session.id, events: events() };
  }

  /** 非流式降级：同一事件管道累积为完整回复（SCF 不支持 SSE 时功能完整），question 并入回复文本。 */
  async runRoundCollected(userId: number, sessionId: number, message: string): Promise<CollectedRound> {
    const { sessionId: sid, events } = await this.prepareRound(userId, sessionId, message, { mergeQuestion: true });
    let reply = '';
    let tokens: RoundTokens = { prompt: 0, completion: 0, total: 0 };
    let messageId: number | null = null;
    for await (const ev of events) {
      if (ev.event === 'delta') {
        reply += String(ev.data.text ?? '');
      } else if (ev.event === 'question') {
        const q = ev.data as { question?: string; options?: { label?: string }[] };
        const opts = (q.options ?? []).map((o) => o.label).join(' / ');
        reply += `\n\n[AI 提问] ${q.question ?? ''}${opts ? `\n选项：${opts}` : ''}`;
      } else if (ev.event === 'done') {
        const d = ev.data as { messageId: number | null; tokens: RoundTokens };
        tokens = d.tokens;
        messageId = d.messageId;
      } else if (ev.event === 'error') {
        throw Object.assign(new Error(String(ev.data.message)), { status: 502 });
      }
    }
    return { sessionId: sid, messageId, reply, tokens };
  }

  private async recordUsage(model: string, refId: string, tokens: RoundTokens, startedAt: number): Promise<void> {
    try {
      await tokenUsageService.record({
        scene: 'chat',
        refId,
        model,
        promptTokens: tokens.prompt,
        completionTokens: tokens.completion,
        totalTokens: tokens.total,
        durationMs: Date.now() - startedAt,
      });
    } catch (err) {
      logger.error(`[ai-assistant] token usage record failed: ${(err as Error).message}`);
    }
  }
}

export const chatService = new ChatService();
