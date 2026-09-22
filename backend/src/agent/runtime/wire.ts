// streamEvents(v2) → SSE 逻辑事件映射（arch 3.2.4 / 5.2）。
// 输出为与传输无关的事件序列；ai-assistant / ai-analysis 路由负责序列化为 SSE 帧
// 并在 done 事件中补充 sessionId / messageId 等会话信息。

export type AgentSseEventName = 'delta' | 'tool_call' | 'tool_result' | 'step' | 'done' | 'error';

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
          const text = typeof chunk?.content === 'string' ? chunk.content : '';
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
          yield {
            event: 'tool_result',
            data: {
              name: ev.name,
              rowCount: countOutputRows(ev.data.output),
              durationMs: startedAt ? Date.now() - startedAt : null,
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
