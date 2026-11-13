import { env } from '@/config/env';
import { readRuntimeNumber, SYSTEM_CONFIG_KEYS } from '@/config/system-config.reader';
import { BudgetGuard } from '@/agent/runtime/budget-guard';
import { ToolFailureGuard } from '@/agent/runtime/failure-guard';

// agent 轮次运行时配置（巡检 / 对话 / 定向分析三条链路共用）：
// - budget：单任务工具调用上限，超限即终止本轮（budget_exceeded 不重试）
// - failureGuard：同一工具连续失败熔断，防止弱模型在错误形状上无限重试
// - recursionLimit：单轮步数硬上限。deepagents 把 LangGraph 默认的 25 顶到 1e4，
//   弱模型在错误参数上可无限重试（2026-11 mimo 事故：单轮 57 分钟不收敛）
// - abortController/signal：预算超限时由工具包装层主动 abort，让在途模型请求立即失败、
//   轮次当场收口——否则抛错会被 ToolNode 转成可恢复的 error ToolMessage，模型继续重试
export interface AgentRuntimeConfig {
  [key: string]: unknown;
  configurable: {
    thread_id: string;
    budget: BudgetGuard;
    failureGuard: ToolFailureGuard;
    refId: string;
    abortController: AbortController;
  };
  recursionLimit: number;
  signal: AbortSignal;
}

export async function buildAgentRuntimeConfig(opts: { threadId: string; refId: string }): Promise<AgentRuntimeConfig> {
  const abortController = new AbortController();
  return {
    configurable: {
      thread_id: opts.threadId,
      budget: new BudgetGuard(await readRuntimeNumber(SYSTEM_CONFIG_KEYS.aiToolCallBudget, env.AI_TOOL_CALL_BUDGET)),
      failureGuard: new ToolFailureGuard(
        await readRuntimeNumber(SYSTEM_CONFIG_KEYS.aiToolFailureThreshold, env.AI_TOOL_FAILURE_THRESHOLD),
      ),
      refId: opts.refId,
      abortController,
    },
    recursionLimit: await readRuntimeNumber(SYSTEM_CONFIG_KEYS.aiAgentMaxSteps, env.AI_AGENT_MAX_STEPS),
    signal: abortController.signal,
  };
}
