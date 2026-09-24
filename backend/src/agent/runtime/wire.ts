// streamEvents(v2) → SSE 逻辑事件映射（arch 3.2.4 / 5.2）。
// 输出为与传输无关的事件序列；ai-assistant / ai-analysis 路由负责序列化为 SSE 帧
// 并在 done 事件中补充 sessionId / messageId 等会话信息。

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

export async function* streamAgentEvents(
  agent: { streamEvents: (input: unknown, options: Record<string, unknown>) => AsyncIterable<StreamEventLike> },
  input: unknown,
  config: Record<string, unknown>,
): AsyncGenerator<AgentSseEvent> {
  const toolStartAt = new Map<string, number>();
  const usage = { prompt: 0, completion: 0, total: 0 };
  try {
    const stream = agent.streamEvents(input, { version: 'v2', ...config });
    for await (const ev of stream) {
      switch (ev.event) {
        case 'on_chat_model_stream': {
          const chunk = ev.data.chunk as { content?: unknown } | undefined;
          const text = contentText(chunk?.content);
          if (text) yield { event: 'delta', data: { text } };
          break;
        }
        case 'on_chat_model_end': {
          const meta = extractUsage(ev.data.output);
          usage.prompt += meta.input_tokens ?? 0;
          usage.completion += meta.output_tokens ?? 0;
          usage.total += meta.total_tokens ?? 0;
          break;
        }
        case 'on_tool_start': {
          if (ev.run_id) toolStartAt.set(ev.run_id, Date.now());
          yield { event: 'tool_call', data: { name: ev.name, args: ev.data.input } };
          break;
        }
        case 'on_tool_end': {
          const startedAt = ev.run_id ? toolStartAt.get(ev.run_id) : undefined;
          if (ev.run_id) toolStartAt.delete(ev.run_id);
          const output = ev.data.output as { error?: unknown } | undefined;
          const failed = typeof output?.error === 'string';
          const question = extractQuestionMarker(ev.data.output);
          if (question) {
            yield { event: 'question', data: question };
          }
          yield {
            event: 'tool_result',
            data: {
              name: ev.name,
              rowCount: failed ? null : countOutputRows(ev.data.output),
              durationMs: startedAt ? Date.now() - startedAt : null,
              ...(failed ? { error: output?.error } : {}),
            },
          };
          break;
        }
        case 'on_tool_error': {
          // 工具失败必须闭环 tool_result，否则前端该行永远停留在"运行中"
          const startedAt = ev.run_id ? toolStartAt.get(ev.run_id) : undefined;
          if (ev.run_id) toolStartAt.delete(ev.run_id);
          const raw = ev.data.error;
          yield {
            event: 'tool_result',
            data: {
              name: ev.name,
              rowCount: null,
              durationMs: startedAt ? Date.now() - startedAt : null,
              error: raw instanceof Error ? raw.message : String(raw ?? 'tool error'),
            },
          };
          break;
        }
        default:
          break;
      }
    }
    yield { event: 'done', data: { tokens: usage } };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    const code = (err as { code?: string }).code ?? 'agent_error';
    yield { event: 'error', data: { message, code } };
  }
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
