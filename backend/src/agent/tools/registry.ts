import { tool } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import { z } from 'zod';
import { env } from '@/config/env';
import { readRuntimeNumber, SYSTEM_CONFIG_KEYS } from '@/config/system-config.reader';
import { logger } from '@/middleware/request-logger';
import { acmDataSource } from '@/config/database';
import { AiToolAudit } from '@/entities/acm/ai-tool-audit.entity';
import { BudgetGuard, ToolBudgetExceededError } from '@/agent/runtime/budget-guard';
import { ToolFailureGuard } from '@/agent/runtime/failure-guard';

// 白名单工具注册表（arch 3.3.1）：每个工具 = { name, description, schema(zod), handler }，
// 注册时统一包装：预算检查 → 失败熔断 → 超时护栏 → handler → 审计落库（异步，不阻塞主链路）。
// 预算器/失败熔断器与审计 refId 经 invoke configurable 传入（单任务实例语义见 budget-guard.ts）。

export interface ToolDefinition {
  name: string;
  description: string;
  /** 强 schema：既用于对模型广告 JSON Schema，也用于运行时校验（失败信息带实际类型） */
  schema: z.ZodTypeAny;
  handler: (args: unknown) => Promise<unknown>;
  /** 覆盖默认超时（ms）；日志下载/大文件解析等慢工具按需放宽 */
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
      // 运行时用宽容 schema：入参不合法时回落原始入参，而不是在框架层抛异常。
      // 框架层抛错会绕过包装层——预算不消耗、熔断不计数，弱模型在错误形状上可无限重试
      // （2026-11 mimo 事故：同一落盘工具连续失败 214 次、单轮 6M token）。
      // 对模型广告的 JSON Schema 仍是强 schema——zod catch 在 JSON Schema 转换时展开为内层形状。
      schema: lenientSchema(def.schema),
    }),
  );
}

/** 校验失败不抛错的 schema：失败即回传原始入参，由包装层自行校验并产出可操作错误。 */
function lenientSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  return schema.catch((ctx: { input: unknown }) => ctx.input as never);
}

async function runWrapped(def: ToolDefinition, args: unknown, config?: RunnableConfig): Promise<unknown> {
  const configurable = (config?.configurable ?? {}) as {
    budget?: BudgetGuard;
    failureGuard?: ToolFailureGuard;
    refId?: string;
    abortController?: AbortController;
  };
  const guard = configurable.failureGuard;
  const t0 = Date.now();
  let rowCount = 0;
  try {
    configurable.budget?.consume(def.name);
    // 熔断：同一工具连续失败达阈值后本任务内不再执行。弱模型在错误参数形状上反复重试
    // 会把上下文/token 拖到不可控（mimo 事故：同一落盘工具连续失败 214 次、单轮 6M token）。
    if (guard?.isOpen(def.name)) {
      const message =
        `工具 ${def.name} 已连续失败 ${guard.threshold} 次，本轮已熔断不再执行：` +
        `请停止重试本工具，改用其它工具取证，并在最终结论中如实注明该维度无数据。`;
      void writeAudit({
        refId: configurable.refId ?? '',
        toolName: def.name,
        args: args as Record<string, unknown>,
        rowCount,
        durationMs: Date.now() - t0,
        status: 'error',
        error: message,
      });
      return { error: message };
    }
    // 运行时校验放包装层内：解析失败同样计入熔断与预算，不再绕过（框架层抛错的旧行为）。
    const verdict = await def.schema.safeParseAsync(args);
    if (!verdict.success) {
      const opened = guard?.fail(def.name) ?? false;
      const message = `工具 ${def.name} 入参校验失败：${formatIssues(verdict.error)}。请按报错修正参数后重新调用本工具。`;
      void writeAudit({
        refId: configurable.refId ?? '',
        toolName: def.name,
        args: args as Record<string, unknown>,
        rowCount,
        durationMs: Date.now() - t0,
        status: 'error',
        error: message,
      });
      return { error: opened ? `${message}（本工具已连续失败 ${guard?.threshold} 次，后续调用将被熔断，请勿重复重试）` : message };
    }
    const timeoutMs =
      def.timeoutMs ?? (await readRuntimeNumber(SYSTEM_CONFIG_KEYS.aiToolTimeoutMs, env.AI_TOOL_TIMEOUT_MS));
    const result = await withTimeout(Promise.resolve(def.handler(verdict.data)), timeoutMs, def.name);
    rowCount = countRows(result);
    guard?.succeed(def.name);
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
    const opened = isBudget ? false : (guard?.fail(def.name) ?? false);
    const message = (err as Error).message ?? String(err);
    void writeAudit({
      refId: configurable.refId ?? '',
      toolName: def.name,
      args: args as Record<string, unknown>,
      rowCount,
      durationMs: Date.now() - t0,
      status: isBudget ? 'budget_exceeded' : 'error',
      error: message,
    });
    // deepagents/LangGraph 的工具抛错会以 superstep 异常终止整轮对话（模型无法解释），
    // 故除预算超限（必须中止）外，统一转为结构化 error 结果交由模型自适应作答
    if (isBudget) {
      // 预算超限必须终止本轮：抛错会被 ToolNode 转成可恢复的 error ToolMessage，模型会继续
      // 重试直到步数上限（2026-11 mimo 事故：预算早已耗尽，轮次仍跑了 57 分钟）。
      // 主动 abort 让在途的模型请求立即失败，轮次当场收口。
      configurable.abortController?.abort(err);
      throw err;
    }
    const suffix = opened
      ? `（本工具已连续失败 ${guard?.threshold} 次，后续调用将被熔断，请勿重复重试）`
      : '';
    return { error: `${message}${suffix}` };
  }
}

/** zod 校验失败的可操作描述：逐条给出字段定位与实际收到的类型。 */
function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(根)';
      const detail =
        issue.code === z.ZodIssueCode.invalid_type && !issue.message.includes(issue.received)
          ? `${issue.message}（实际收到 ${issue.received}）`
          : issue.message;
      return `${path}: ${detail}`;
    })
    .join('；');
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
