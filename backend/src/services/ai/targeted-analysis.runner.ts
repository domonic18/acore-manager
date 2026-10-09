import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acmDataSource } from '@/config/database';
import { env } from '@/config/env';
import { readRuntimeNumber, SYSTEM_CONFIG_KEYS } from '@/config/system-config.reader';
import { logger } from '@/middleware/request-logger';
import { getAgent } from '@/agent/runtime/agent-factory';
import { BudgetGuard } from '@/agent/runtime/budget-guard';
import { AiTargetedAnalysis } from '@/entities/acm/ai-targeted-analysis.entity';
import { clearConclusionCaptureRoot, readConclusionCapture, setConclusionCaptureRoot } from '@/agent/tools/analysis-tools';
import { llmConfigService } from './llm-config.service';
import { tokenUsageService } from './token-usage.service';
import { emptyTokens, sumTokens, watchAgentEvents, type RoundAccumulator } from './agent-round.util';
import { buildAnalysisJsonFixPrompt, buildTargetedAnalysisTaskPrompt } from './targeted-analysis-prompt';
import { describeIssues, enforceFalsePositiveRule, parseConclusion, type AnalysisConclusion } from './targeted-analysis.conclusion';
import type { ConclusionSubject } from '@/agent/tools/analysis-tools';

// 定向分析执行器（异步化拆分）：按 ai_targeted_analysis 行运行 analysis 场景 Agent 取证并产出结论，
// 最终结论经 submit_conclusion 工具 schema 校验落盘捕获目录（文本解析仅作兜底），校验失败追问一轮
// （issues 由 zod 校验清单拼装）。终态（ok/failed）落库后返回。不依赖 HTTP/SSE，
// 供 manager-job 任务串行调用（结论捕获目录为模块态，同草稿目录的串行假设）；web 侧只建行与触发。

export interface TargetedBanContext {
  date?: string;
  reason?: string;
  bannedBy?: string;
}

export interface TargetedAnalysisSubject {
  realm: string;
  subjectType: 'character' | 'account';
  subjectName: string;
  timeFrom: string;
  timeTo: string;
  banContext?: TargetedBanContext;
}

export interface TargetedAnalysisOutcome {
  ok: boolean;
  analysisId: number;
  conclusion?: AnalysisConclusion;
  tokens?: { prompt: number; completion: number; total: number };
  error?: string;
}

export class TargetedAnalysisError extends Error {
  constructor(
    message: string,
    public code: string = 'agent_error',
  ) {
    super(message);
  }
}

export async function runTargetedAnalysis(analysisId: number, subject: TargetedAnalysisSubject): Promise<TargetedAnalysisOutcome> {
  const startedAt = Date.now();
  // 结论捕获目录每次运行独立（submit_conclusion 落盘点）；追问轮不清盘，已提交的结论仍然有效
  const captureDir = mkdtempSync(join(tmpdir(), 'acm-analysis-capture-'));
  setConclusionCaptureRoot(captureDir);
  try {
    const cfg = await llmConfigService.resolveDefault();
    const agent = await getAgent(cfg, 'analysis');
    // 每次运行必须使用全新线程：复用旧线程会经 checkpointer 重放上一次的结论（巡检同款教训）
    const config = {
      configurable: {
        thread_id: `targeted:${analysisId}:${randomUUID()}`,
        budget: new BudgetGuard(await readRuntimeNumber(SYSTEM_CONFIG_KEYS.aiToolCallBudget, env.AI_TOOL_CALL_BUDGET)),
        refId: `analysis:${analysisId}`,
      },
    };
    const makeError = (message: string, code: string): Error => new TargetedAnalysisError(message, code);
    const acc: RoundAccumulator = { text: '', tokens: emptyTokens() };

    for await (const ev of watchAgentEvents(agent, { messages: [{ role: 'user', content: buildTargetedAnalysisTaskPrompt(subject) }] }, config, acc, makeError)) {
      void ev;
    }

    let tokens = acc.tokens;
    let resolved = resolveConclusion(captureDir, acc.text, subject);
    if (!resolved.conclusion) {
      // schema 校验失败追问一轮：同 thread 携带 schema 错误清单要求重调 submit_conclusion（巡检同款）
      logger.warn(`[analysis] schema repair round for #${analysisId}: ${resolved.issues}`);
      const firstRoundTokens = tokens;
      acc.text = '';
      acc.tokens = emptyTokens();
      for await (const ev of watchAgentEvents(
        agent,
        { messages: [{ role: 'user', content: buildAnalysisJsonFixPrompt(resolved.issues) }] },
        config,
        acc,
        makeError,
      )) {
        void ev;
      }
      // 计量口径与巡检一致：修复轮 tokens 累加，不覆盖
      tokens = sumTokens(firstRoundTokens, acc.tokens);
      resolved = resolveConclusion(captureDir, acc.text, subject);
    }
    if (!resolved.conclusion) throw new TargetedAnalysisError(`结论 JSON 两轮校验均未通过：${resolved.issues}`, 'schema_mismatch');

    const conclusion = enforceFalsePositiveRule(resolved.conclusion);
    await persistSuccess(analysisId, conclusion, tokens, Date.now() - startedAt, cfg.modelName);
    return { ok: true, analysisId, conclusion, tokens };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    logger.error(`[analysis] #${analysisId} ${subject.subjectType}:${subject.subjectName} failed: ${message}`);
    await persistFailure(analysisId, message).catch(() => undefined);
    return { ok: false, analysisId, error: message };
  } finally {
    clearConclusionCaptureRoot();
    rmSync(captureDir, { recursive: true, force: true });
  }
}

// 结论统一出口：submit_conclusion 工具提交优先（已过形状校验，此处做 subject 回显等值复验），
// 文本解析兜底（旧契约路径）。返回校验问题清单供修复轮拼装追问消息。
function resolveConclusion(captureDir: string, text: string, subject: ConclusionSubject): { conclusion: AnalysisConclusion | null; issues: string } {
  const captured = readConclusionCapture(captureDir, subject);
  if (captured.conclusion) return { conclusion: captured.conclusion, issues: '' };
  const fromText = parseConclusion(text, subject);
  if (fromText) return { conclusion: fromText, issues: '' };
  return { conclusion: null, issues: captured.issues || describeIssues(text, subject) };
}

async function persistSuccess(
  analysisId: number,
  conclusion: AnalysisConclusion,
  tokens: { prompt: number; completion: number; total: number },
  durationMs: number,
  model: string,
): Promise<void> {
  await acmDataSource
    .getRepository(AiTargetedAnalysis)
    .update(analysisId, {
      status: 'ok',
      conclusionJson: { ...conclusion, markdown: undefined } as any,
      conclusionMarkdown: conclusion.markdown ?? null,
      tokenUsage: tokens as any,
    });
  void tokenUsageService
    .record({
      scene: 'analysis',
      refId: `analysis:${analysisId}`,
      model,
      promptTokens: tokens.prompt,
      completionTokens: tokens.completion,
      totalTokens: tokens.total,
      durationMs,
    })
    .catch((err: unknown) => logger.error(`[analysis] token record failed: ${(err as Error).message}`));
}

async function persistFailure(analysisId: number, message: string): Promise<void> {
  await acmDataSource.getRepository(AiTargetedAnalysis).update(analysisId, {
    status: 'failed',
    conclusionJson: { error: message.slice(0, 500) } as any,
  });
}
