// streamEvents(v2) → SSE 逻辑事件映射（arch 3.2.4 / 5.2）。
// 输出为与传输无关的事件序列；ai-assistant / ai-analysis 路由负责序列化为 SSE 帧
// 并在 done 事件中补充 sessionId / messageId 等会话信息。
// 映射为表驱动：每类 LangChain 回调事件一个 handler，返回待下发的逻辑事件数组。

export type AgentSseEventName = 'delta' | 'tool_call' | 'tool_result' | 'step' | 'question' | 'done' | 'error';

export interface AgentSseEvent {
  event: AgentSseEventName;
  data: Record<string, unknown>;
}

interface StreamEventLike {
  event: string;
  name?: string;
  run_id?: string;
  data: Record<string, unknown>;
}

interface UsageLike {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

interface WireContext {
  toolStartAt: Map<string, number>;
  usage: { prompt: number; completion: number; total: number };
}

type RawEventHandler = (ev: StreamEventLike, ctx: WireContext) => AgentSseEvent[];

const HANDLERS: Record<string, RawEventHandler> = {
  on_chat_model_stream: (ev) => {
    const chunk = ev.data.chunk as { content?: unknown } | undefined;
    const text = contentText(chunk?.content);
    return text ? [{ event: 'delta', data: { text } }] : [];
  },
  on_chat_model_end: (ev, ctx) => {
    const meta = extractUsage(ev.data.output);
    ctx.usage.prompt += meta.input_tokens ?? 0;
    ctx.usage.completion += meta.output_tokens ?? 0;
    ctx.usage.total += meta.total_tokens ?? 0;
    return [];
  },
  on_tool_start: (ev, ctx) => {
    if (ev.run_id) ctx.toolStartAt.set(ev.run_id, Date.now());
    return [{ event: 'tool_call', data: { name: ev.name, args: ev.data.input } }];
  },
  on_tool_end: (ev, ctx) => {
    const output = ev.data.output as { error?: unknown } | undefined;
    const failed = typeof output?.error === 'string';
    const events: AgentSseEvent[] = [];
    const question = extractQuestionMarker(ev.data.output);
    if (question) events.push({ event: 'question', data: question });
    events.push(toolResultEvent(ev, ctx, failed ? (output?.error as string) : undefined));
    return events;
  },
  on_tool_error: (ev, ctx) => {
    const raw = ev.data.error;
    return [toolResultEvent(ev, ctx, raw instanceof Error ? raw.message : String(raw ?? 'tool error'))];
  },
};

export async function* streamAgentEvents(
  agent: { streamEvents: (input: unknown, options: Record<string, unknown>) => AsyncIterable<StreamEventLike> },
  input: unknown,
  config: Record<string, unknown>,
): AsyncGenerator<AgentSseEvent> {
  const ctx: WireContext = { toolStartAt: new Map(), usage: { prompt: 0, completion: 0, total: 0 } };
  try {
    const stream = agent.streamEvents(input, { version: 'v2', ...config });
    for await (const ev of stream) {
      const handler = HANDLERS[ev.event];
      if (handler) {
        for (const out of handler(ev, ctx)) yield out;
      }
    }
    yield { event: 'done', data: { tokens: ctx.usage } };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    const code = (err as { code?: string }).code ?? 'agent_error';
    yield { event: 'error', data: { message, code } };
  }
}

// tool_call/tool_result 配对收尾：取回该 run 的开始时间算耗时；error 事件与失败的工具返回
// 都必须闭环为带 error 的 tool_result，否则前端该行永远停留在"运行中"
function toolResultEvent(ev: StreamEventLike, ctx: WireContext, error?: string): AgentSseEvent {
  const startedAt = ev.run_id ? ctx.toolStartAt.get(ev.run_id) : undefined;
  if (ev.run_id) ctx.toolStartAt.delete(ev.run_id);
  return {
    event: 'tool_result',
    data: {
      name: ev.name,
      rowCount: error === undefined ? countOutputRows(ev.data.output) : null,
      durationMs: startedAt ? Date.now() - startedAt : null,
      ...(error !== undefined ? { error } : {}),
    },
  };
}

function extractUsage(output: unknown): UsageLike {
  const meta = (output as { usage_metadata?: UsageLike } | undefined)?.usage_metadata;
  return meta ?? {};
}

// chunk.content 归一化：OpenAI 系为纯字符串；Anthropic 系（kimi-for-coding 等）为
// 分块数组 [{type:'thinking',thinking} | {type:'text',text}]——thinking 不进 delta（正本只落最终回复）
function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  let out = '';
  for (const block of content) {
    const b = block as { type?: string; text?: unknown };
    if (b?.type === 'text' && typeof b.text === 'string') out += b.text;
  }
  return out;
}

function countOutputRows(output: unknown): number | null {
  const content = (output as { content?: unknown } | undefined)?.content ?? output;
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed.length : null;
    } catch {
      return null;
    }
  }
  if (Array.isArray(content)) return content.length;
  return null;
}

// ask_user 工具返回 __question__ 标记（ask-user.tool.ts）：兼容两种形态——
// LangChain tool() 包装后为 ToolMessage {content: JSON 字符串}；部分链路为裸对象。
export function extractQuestionMarker(output: unknown): Record<string, unknown> | null {
  const content = (output as { content?: unknown } | undefined)?.content ?? output;
  let candidate: unknown = content;
  if (typeof content === 'string') {
    try {
      candidate = JSON.parse(content);
    } catch {
      return null;
    }
  }
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    const marker = (candidate as Record<string, unknown>)['__question__'];
    if (marker && typeof marker === 'object' && !Array.isArray(marker)) {
      return marker as Record<string, unknown>;
    }
  }
  return null;
}
