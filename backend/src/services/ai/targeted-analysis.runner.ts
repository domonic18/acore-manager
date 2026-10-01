import { randomUUID } from 'node:crypto';
import { acmDataSource } from '@/config/database';
import { env } from '@/config/env';
import { readRuntimeNumber, SYSTEM_CONFIG_KEYS } from '@/config/system-config.reader';
import { logger } from '@/middleware/request-logger';
import { getAgent } from '@/agent/runtime/agent-factory';
import { BudgetGuard } from '@/agent/runtime/budget-guard';
import { AiTargetedAnalysis } from '@/entities/acm/ai-targeted-analysis.entity';
import { llmConfigService } from './llm-config.service';
import { tokenUsageService } from './token-usage.service';
import { emptyTokens, sumTokens, watchAgentEvents, type RoundAccumulator } from './agent-round.util';
import { describeIssues, enforceFalsePositiveRule, parseConclusion, type AnalysisConclusion } from './targeted-analysis.conclusion';

// 定向分析执行器（异步化拆分）：按 ai_targeted_analysis 行运行 analysis 场景 Agent 取证并产出结论，
// 终态（ok/failed）落库后返回。不依赖 HTTP/SSE，供 manager-job 任务串行调用；web 侧只建行与触发。

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

    for await (const ev of watchAgentEvents(agent, { messages: [{ role: 'user', content: buildTaskPrompt(subject) }] }, config, acc, makeError)) {
      void ev;
    }

    let tokens = acc.tokens;
    let conclusion = parseConclusion(acc.text, subject);
    if (!conclusion) {
      // schema 校验失败追问一轮：同 thread 携带具体错误要求重出完整 JSON（巡检同款）
      const issues = describeIssues(acc.text, subject);
      logger.warn(`[analysis] schema repair round for #${analysisId}: ${issues}`);
      const firstRoundTokens = tokens;
      acc.text = '';
      acc.tokens = emptyTokens();
      for await (const ev of watchAgentEvents(
        agent,
        { messages: [{ role: 'user', content: `上一次输出未通过校验：${issues}。请重新输出完整的结论 JSON 对象（包含全部字段，markdown 字段为全文）。` }] },
        config,
        acc,
        makeError,
      )) {
        void ev;
      }
      // 计量口径与巡检一致：修复轮 tokens 累加，不覆盖
      tokens = sumTokens(firstRoundTokens, acc.tokens);
      conclusion = parseConclusion(acc.text, subject);
    }
    if (!conclusion) throw new TargetedAnalysisError('结论 JSON 两轮校验均未通过', 'schema_mismatch');

    conclusion = enforceFalsePositiveRule(conclusion);
    await persistSuccess(analysisId, conclusion, tokens, Date.now() - startedAt, cfg.modelName);
    return { ok: true, analysisId, conclusion, tokens };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    logger.error(`[analysis] #${analysisId} ${subject.subjectType}:${subject.subjectName} failed: ${message}`);
    await persistFailure(analysisId, message).catch(() => undefined);
    return { ok: false, analysisId, error: message };
  }
}

function buildTaskPrompt(input: TargetedAnalysisSubject): string {
  const banNote = input.banContext?.reason
    ? `封禁背景：${input.banContext.date ?? '未知日期'} 由 ${input.banContext.bannedBy ?? '未知'} 封禁，理由「${input.banContext.reason}」。`
    : '封禁背景：未提供（可能是申诉之外的常规核查）。';
  const subjectNote =
    input.subjectType === 'character'
      ? `分析对象：角色「${input.subjectName}」（${input.realm}）`
      : `分析对象：账号「${input.subjectName}」（${input.realm}，需汇总名下全部角色）`;
  const content = [
    `请对以下对象做定向分析，产出封禁申诉研判结论。`,
    ``,
    subjectNote,
    `时间范围：${input.timeFrom} 至 ${input.timeTo}（含当天）`,
    banNote,
    ``,
    `取证步骤建议（全方位取证，逐维度执行；某维度无数据时在结论中如实注明"无数据"）：`,
    `1. get_account_overview / get_ban_history 查明对象背景与封禁记录`,
    `2. parse_anticheat_violations(from, to, explain=true) 做时段内违规聚合与误报解释；`,
    `   需聚焦目标时传入 player（角色名）或 guid 精确过滤，避免全服聚合淹没目标`,
    `3. 移动轨迹核查：检查返回的 players 明细中目标的地图序列（maps）、换图次数（mapMoves）、`,
    `   坐标离散度（coordSpread）、绕圈长度（loopLength）、大位移距离（jumpYards/maxJumpYards），`,
    `   识别重复路线/绕圈挂机/瞬移等异常移动模式`,
    `4. get_anticheat_record / get_character_overview / get_character_auras 佐证行为与光环`,
    `5. get_login_ip_history / get_accounts_by_ip 排查关联账号与登录异常`,
    `6. parse_server_anomalies(from, to) 复核同时段服务器侧异常标记（外挂特征/爆破登录等）`,
    `7. 汇总输出结论 JSON`,
    ``,
    `最终必须输出一个 JSON 对象（可置于 \`\`\`json 围栏中），字段：`,
    `- subjectType: "${input.subjectType}"，subjectName: "${input.subjectName}"（必须与此处完全一致）`,
    `- timeRange: {from: "${input.timeFrom}", to: "${input.timeTo}"}`,
    `- violations: [{type, count, confirmed: true|false, note}]（时段内无违规则为空数组；`,
    `  轨迹/绕圈/GPS 类异常也作为条目列入，type 用 "loop_patrol"/"teleport" 等语义化命名，note 写明数值依据）`,
    `- falsePositiveSignals: []（未排除的误报信号，无则为空数组）`,
    `- evidence: [{source: 来源工具名, quote: 原始行摘录}]（每条注明来源，禁止编造；`,
    `  轨迹类结论必须附带 rollup 数值摘录作为证据）`,
    `- suggestion: "maintain|lift|downgrade|manual_review" 之一`,
    `- suggestionReason: 一段话说明处置理由（须覆盖违规、轨迹、IP 关联三个维度的综合判断）`,
    `- markdown: 面向申诉人的完整回复全文（简体中文，结论前置）`,
    ``,
    `硬性要求：falsePositiveSignals 非空时 suggestion 必须为 "manual_review"；`,
    `证据必须来自工具返回原文摘录并注明来源工具；无数据支撑的维度如实写"无数据"。`,
  ].join('\n');
  return content;
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
