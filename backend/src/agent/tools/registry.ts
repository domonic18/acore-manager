import { tool } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import { z } from 'zod';
import { env } from '@/config/env';
import { readRuntimeNumber, SYSTEM_CONFIG_KEYS } from '@/config/system-config.reader';
import { logger } from '@/middleware/request-logger';
import { acmDataSource } from '@/config/database';
import { AiToolAudit } from '@/entities/acm/ai-tool-audit.entity';
import { BudgetGuard, ToolBudgetExceededError } from '@/agent/runtime/budget-guard';

// 白名单工具注册表（arch 3.3.1）：每个工具 = { name, description, schema(zod), handler }，
// 注册时统一包装：预算检查 → 超时护栏 → handler → 审计落库（异步，不阻塞主链路）。
// 预算器与审计 refId 经 invoke configurable 传入（单任务实例语义见 budget-guard.ts）。

export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  handler: (args: unknown) => Promise<unknown>;
  /** 覆盖默认超时（ms）；日志下载等慢工具按需放宽 */
  timeoutMs?: number;
}

const registry = new Map<string, ToolDefinition>();

export function registerTool(def: ToolDefinition): void {
  registry.set(def.name, def);
}

export function getToolNames(): string[] {
  return [...registry.keys()];
}

/** 供测试与 Job 冷启动重复注册场景使用 */
export function clearTools(): void {
  registry.clear();
}

export function exportTools(): ReturnType<typeof tool>[] {
  return [...registry.values()].map((def) =>
    tool((args: unknown, config?: RunnableConfig) => runWrapped(def, args, config), {
      name: def.name,
      description: def.description,
      schema: def.schema,
    }),
  );
}

async function runWrapped(def: ToolDefinition, args: unknown, config?: RunnableConfig): Promise<unknown> {
  const configurable = (config?.configurable ?? {}) as { budget?: BudgetGuard; refId?: string };
  const t0 = Date.now();
  let rowCount = 0;
  try {
    configurable.budget?.consume(def.name);
    const timeoutMs =
      def.timeoutMs ?? (await readRuntimeNumber(SYSTEM_CONFIG_KEYS.aiToolTimeoutMs, env.AI_TOOL_TIMEOUT_MS));
    const result = await withTimeout(Promise.resolve(def.handler(args)), timeoutMs, def.name);
    rowCount = countRows(result);
    void writeAudit({
      refId: configurable.refId ?? '',
      toolName: def.name,
      args: args as Record<string, unknown>,
      rowCount,
      durationMs: Date.now() - t0,
      status: 'ok',
    });
    return result;
  } catch (err) {
    const isBudget = err instanceof ToolBudgetExceededError;
    void writeAudit({
      refId: configurable.refId ?? '',
      toolName: def.name,
      args: args as Record<string, unknown>,
      rowCount,
      durationMs: Date.now() - t0,
      status: isBudget ? 'budget_exceeded' : 'error',
      error: (err as Error).message,
    });
    // deepagents/LangGraph 的工具抛错会以 superstep 异常终止整轮对话（模型无法解释），
    // 故除预算超限（必须中止）外，统一转为结构化 error 结果交由模型自适应作答
    if (isBudget) throw err;
    return { error: (err as Error).message ?? String(err) };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, name: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`tool ${name} timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function countRows(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      if (Array.isArray(parsed)) return parsed.length;
    } catch {
      // 非 JSON 字符串按单条计
    }
    return 1;
  }
  if (result != null && typeof result === 'object') {
    const value = (result as { items?: unknown[]; data?: unknown[]; rows?: unknown[] });
    if (Array.isArray(value.rows)) return value.rows.length;
    if (Array.isArray(value.items)) return value.items.length;
    if (Array.isArray(value.data)) return value.data.length;
    return 1;
  }
  return result != null ? 1 : 0;
}

function writeAudit(entry: {
  refId: string;
  toolName: string;
  args: Record<string, unknown>;
  rowCount: number;
  durationMs: number;
  status: string;
  error?: string;
}): void {
  const row = new AiToolAudit();
  row.refId = entry.refId;
  row.toolName = entry.toolName;
  row.argsJson = entry.args ?? null;
  row.rowCount = entry.rowCount;
  row.durationMs = entry.durationMs;
  row.status = entry.status;
  row.error = entry.error ?? null;
  void acmDataSource
    .getRepository(AiToolAudit)
    .insert(row)
    .catch((err: unknown) => logger.error(`[tool-audit] write failed: ${(err as Error).message}`));
}
