import { streamAgentEvents, type AgentSseEvent } from '@/agent/runtime/wire';

// Agent 轮次事件流消费共享 helper（inspection / targeted-analysis 同形链路收敛）：
// - runAgentRound：收集形态——聚合全文 + token 用量 + 耗时，不向下游转发事件
// - watchAgentEvents：透传形态——事件原样转发（delta/tool_call/…），同时累积文本与 token
// 两种形态在 error 事件上统一经 makeError 转成调用方错误类型抛出（中断本轮）；
// 修复轮计量口径为 tokens 累加（sumTokens），不覆盖。

export interface AgentRoundTokens {
  prompt: number;
  completion: number;
  total: number;
}

export interface RoundAccumulator {
  text: string;
  tokens: AgentRoundTokens;
}

export function emptyTokens(): AgentRoundTokens {
  return { prompt: 0, completion: 0, total: 0 };
}

export function sumTokens(a: AgentRoundTokens, b: AgentRoundTokens): AgentRoundTokens {
  return { prompt: a.prompt + b.prompt, completion: a.completion + b.completion, total: a.total + b.total };
}

export function tokensFromEvent(data: Record<string, unknown>): AgentRoundTokens {
  const t = (data.tokens ?? {}) as Partial<AgentRoundTokens>;
  return { prompt: t.prompt ?? 0, completion: t.completion ?? 0, total: t.total ?? 0 };
}

export async function runAgentRound(
  agent: unknown,
  input: unknown,
  config: Record<string, unknown>,
  makeError: (message: string, code: string) => Error,
): Promise<{ text: string; tokens: AgentRoundTokens; durationMs: number }> {
  const t0 = Date.now();
  let text = '';
  let tokens = emptyTokens();
  for await (const ev of streamAgentEvents(agent as never, input, config)) {
    if (ev.event === 'delta') text += String(ev.data.text ?? '');
    else if (ev.event === 'done') tokens = tokensFromEvent(ev.data);
    else if (ev.event === 'error') throw makeError(String(ev.data.message ?? 'agent error'), String(ev.data.code ?? 'agent_error'));
  }
  return { text, tokens, durationMs: Date.now() - t0 };
}

export async function* watchAgentEvents(
  agent: unknown,
  input: unknown,
  config: Record<string, unknown>,
  acc: RoundAccumulator,
  makeError: (message: string, code: string) => Error,
): AsyncGenerator<AgentSseEvent> {
  for await (const ev of streamAgentEvents(agent as never, input, config)) {
    if (ev.event === 'delta') {
      acc.text += String(ev.data.text ?? '');
      yield ev;
    } else if (ev.event === 'done') {
      acc.tokens = tokensFromEvent(ev.data);
    } else if (ev.event === 'error') {
      throw makeError(String(ev.data.message ?? 'agent error'), String(ev.data.code ?? 'agent_error'));
    } else {
      yield ev;
    }
  }
}
