import { randomUUID } from 'node:crypto';
import { acmDataSource } from '@/config/database';
import { env } from '@/config/env';
import { readRuntimeNumber, SYSTEM_CONFIG_KEYS } from '@/config/system-config.reader';
import { logger } from '@/middleware/request-logger';
import { AiTargetedAnalysis } from '@/entities/acm/ai-targeted-analysis.entity';
import type { AgentSseEvent } from '@/agent/runtime/wire';
import { getAgent } from '@/agent/runtime/agent-factory';
import { BudgetGuard } from '@/agent/runtime/budget-guard';
import { auditLogService } from '@/services/audit-log.service';
import { ServiceError } from '@/shared/errors/service-error';
import { llmConfigService } from './llm-config.service';
import { tokenUsageService } from './token-usage.service';
import { emptyTokens, sumTokens, watchAgentEvents, type RoundAccumulator } from './agent-round.util';
import { describeIssues, enforceFalsePositiveRule, parseConclusion, type AnalysisConclusion } from './targeted-analysis.conclusion';

export { ServiceError };
export type { AnalysisConclusion, AnalysisSuggestion } from './targeted-analysis.conclusion';

// 定向分析编排（arch 5.1 / 需求 3.8，账号申诉场景）：单一角色/账号 + 时间范围，
// 复用巡检同款白名单工具取证，结论 JSON 校验（失败追问一轮）后追加落库 ai_targeted_analysis
// （同一对象可多轮分析，不覆盖历史）。误报信号非空时强制 manual_review（确定性降级兜底）。
// 结论 JSON 契约（解析/校验/降级）在 targeted-analysis.conclusion，事件流消费复用 agent-round.util。

export interface TargetedAnalysisInput {
  realm: string;
  subjectType: 'character' | 'account';
  subjectName: string;
  timeFrom: string;
  timeTo: string;
  banContext?: { date?: string; reason?: string; bannedBy?: string };
  operatorId: number;
  operatorName: string;
}

export type TargetedAnalysisEvent = AgentSseEvent;

class TargetedAnalysisError extends Error {
  constructor(
    message: string,
    public code: string = 'agent_error',
  ) {
    super(message);
  }
}

class TargetedAnalysisService {
  stream(input: TargetedAnalysisInput): AsyncGenerator<TargetedAnalysisEvent> {
    return this.doStream(input);
  }

  private async *doStream(input: TargetedAnalysisInput): AsyncGenerator<TargetedAnalysisEvent> {
    const repo = acmDataSource.getRepository(AiTargetedAnalysis);
    const row = await repo.save(
      repo.create({
        realm: input.realm,
        subjectType: input.subjectType,
        subjectName: input.subjectName,
        subjectGuid: null,
        timeFrom: new Date(`${input.timeFrom}T00:00:00+08:00`),
        timeTo: new Date(`${input.timeTo}T23:59:59+08:00`),
        status: 'running',
        triggeredBy: input.operatorName,
      }),
    );
    const analysisId = row.id;
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

      for await (const ev of watchAgentEvents(agent, { messages: [{ role: 'user', content: this.buildTaskPrompt(input) }] }, config, acc, makeError)) yield ev;

      let tokens = acc.tokens;
      let conclusion = parseConclusion(acc.text, input);
      if (!conclusion) {
        // schema 校验失败追问一轮：同 thread 携带具体错误要求重出完整 JSON（巡检同款）
        const issues = describeIssues(acc.text, input);
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
          yield ev;
        }
        // 计量口径与巡检一致：修复轮 tokens 累加，不覆盖
        tokens = sumTokens(firstRoundTokens, acc.tokens);
        conclusion = parseConclusion(acc.text, input);
      }
      if (!conclusion) throw new TargetedAnalysisError('结论 JSON 两轮校验均未通过', 'schema_mismatch');

      conclusion = enforceFalsePositiveRule(conclusion);
      await this.persistSuccess(analysisId, input, conclusion, tokens, Date.now() - startedAt, cfg.modelName);
      yield { event: 'done', data: { analysisId, conclusion, tokens } };
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      logger.error(`[analysis] #${analysisId} ${input.subjectType}:${input.subjectName} failed: ${message}`);
      await this.persistFailure(analysisId, message).catch(() => undefined);
      yield { event: 'error', data: { message, code: (err as TargetedAnalysisError).code ?? 'agent_error', analysisId } };
    }
  }

  private buildTaskPrompt(input: TargetedAnalysisInput): string {
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
      `取证步骤建议：`,
      `1. get_account_overview / get_ban_history 查明对象背景与封禁记录`,
      `2. parse_anticheat_violations(from, to, explain=true) 做时段内违规聚合与误报解释`,
      `3. get_anticheat_record / get_character_overview / get_character_auras 佐证行为与光环`,
      `4. get_login_ip_history / get_accounts_by_ip 排查关联账号与登录异常`,
      `5. 汇总输出结论 JSON`,
      ``,
      `最终必须输出一个 JSON 对象（可置于 \`\`\`json 围栏中），字段：`,
      `- subjectType: "${input.subjectType}"，subjectName: "${input.subjectName}"（必须与此处完全一致）`,
      `- timeRange: {from: "${input.timeFrom}", to: "${input.timeTo}"}`,
      `- violations: [{type, count, confirmed: true|false, note}]（时段内无违规则为空数组）`,
      `- falsePositiveSignals: []（未排除的误报信号，无则为空数组）`,
      `- evidence: [{source: 来源工具名, quote: 原始行摘录}]（每条注明来源，禁止编造）`,
      `- suggestion: "maintain|lift|downgrade|manual_review" 之一`,
      `- suggestionReason: 一段话说明处置理由`,
      `- markdown: 面向申诉人的完整回复全文（简体中文，结论前置）`,
      ``,
      `硬性要求：falsePositiveSignals 非空时 suggestion 必须为 "manual_review"；`,
      `证据必须来自工具返回原文摘录并注明来源工具；无数据支撑的维度如实写"无数据"。`,
    ].join('\n');
    return content;
  }

  private async persistSuccess(
    analysisId: number,
    input: TargetedAnalysisInput,
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

  private async persistFailure(analysisId: number, message: string): Promise<void> {
    await acmDataSource.getRepository(AiTargetedAnalysis).update(analysisId, {
      status: 'failed',
      conclusionJson: { error: message.slice(0, 500) } as any,
    });
  }

  async list(page = 1, pageSize = 20, subjectName?: string): Promise<{ items: AiTargetedAnalysis[]; total: number }> {
    const repo = acmDataSource.getRepository(AiTargetedAnalysis);
    const qb = repo
      .createQueryBuilder('a')
      .select([
        'a.id',
        'a.realm',
        'a.subjectType',
        'a.subjectName',
        'a.timeFrom',
        'a.timeTo',
        'a.status',
        'a.triggeredBy',
        'a.gmRemark',
        'a.createdAt',
        'a.updatedAt',
      ])
      .orderBy('a.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (subjectName?.trim()) qb.andWhere('a.subject_name LIKE :name', { name: `%${subjectName.trim()}%` });
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getById(id: number): Promise<AiTargetedAnalysis> {
    const row = await acmDataSource.getRepository(AiTargetedAnalysis).findOne({ where: { id } });
    if (!row) throw new ServiceError('定向分析记录不存在', 404);
    return row;
  }

  // 处置备注 / Markdown 润色（T4.7，gmlevel=3）：仅白名单字段，审计记录改动字段清单
  async update(
    id: number,
    patch: { gmRemark?: string; conclusionMarkdown?: string },
    operatorId: number,
    operatorName: string,
  ): Promise<AiTargetedAnalysis> {
    const repo = acmDataSource.getRepository(AiTargetedAnalysis);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new ServiceError('定向分析记录不存在', 404);
    const changes: string[] = [];
    if (patch.gmRemark !== undefined) {
      existing.gmRemark = patch.gmRemark.trim() || null;
      changes.push('gmRemark');
    }
    if (patch.conclusionMarkdown !== undefined) {
      existing.conclusionMarkdown = patch.conclusionMarkdown;
      changes.push('conclusionMarkdown');
    }
    if (changes.length === 0) throw new ServiceError('无可更新字段', 400);
    await repo.save(existing);
    await auditLogService.record({
      operatorId,
      operatorName,
      operation: 'ai.analysis.update',
      target: `id:${id}`,
      details: `subject=${existing.subjectType}:${existing.subjectName} fields=${changes.join(',')}`,
    });
    return existing;
  }

  async remove(id: number, operatorId: number, operatorName: string): Promise<void> {
    const repo = acmDataSource.getRepository(AiTargetedAnalysis);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new ServiceError('定向分析记录不存在', 404);
    await repo.remove(existing);
    await auditLogService.record({
      operatorId,
      operatorName,
      operation: 'ai.analysis.remove',
      target: `id:${id}`,
      details: `subject=${existing.subjectType}:${existing.subjectName} status=${existing.status}`,
    });
  }
}

export const targetedAnalysisService = new TargetedAnalysisService();
