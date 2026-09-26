import { env } from '@/config/env';
import { readRuntimeNumber, SYSTEM_CONFIG_KEYS } from '@/config/system-config.reader';
import { logger } from '@/middleware/request-logger';
import { getAgent } from '@/agent/runtime/agent-factory';
import { BudgetGuard } from '@/agent/runtime/budget-guard';
import { LOG_TYPES, clearWorkspace, manifestKey } from '@/agent/tools/log-tools/log-workspace';
import { setInspectionRunner } from '@/agent/tools/inspection-tools';
import {
  assembleReport,
  clearReportDraftRoot,
  readDraftedSections,
  renderInspectionMarkdown,
  reportDraftDir,
  resetDraftDir,
  setReportDraftRoot,
  validateFinalJson,
  type InspectionReportJson,
  type ReportFinalJson,
} from '@/agent/tools/report-tools';
import { cosGetObjectJson } from '@/shared/utils/cos.util';
import { extractJson } from '@/shared/utils/extract-json.util';
import { runAgentRound, sumTokens } from './agent-round.util';
import { buildInspectionTaskPrompt } from './inspection-prompt';
import { persistInspection, recordInspectionFailure } from './inspection-persist';
import { llmConfigService } from './llm-config.service';
import { feishuNotifyService } from './feishu-notify.service';

// 每日巡检编排（arch 3.4）：断传检查 → deep agent 取证（日志 + 白名单工具，分节结论经
// write_report_section 边运行边落盘）→ 最终小 JSON 校验（失败追问一轮）→ 代码层组装
// 完整报告并渲染 Markdown → ai_report 幂等 upsert → COS 归档 → Redis 摘要 → 计量/飞书。
// 失败退避重试（最多 3 次），最终失败落 status=failed 行 + 飞书告警，不阻塞次日。
// 报告节契约与渲染在 agent/tools/report-tools；任务提示词在 inspection-prompt；
// 持久化（upsert/归档/摘要/简报/失败行）在 inspection-persist；事件流消费复用 agent-round.util。

const RETRY_DELAYS_MS = [1000, 2000, 4000];

export type InspectionTrigger = 'cron' | 'manual' | 'chat';

export interface InspectionInput {
  realm: string;
  date: string;
  trigger: InspectionTrigger;
}

export interface InspectionOutcome {
  ok: boolean;
  realm: string;
  date: string;
  reportId: number | null;
  error: string | null;
  elapsedMs: number;
}

class InspectionError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const toInspectionError = (message: string, code: string): InspectionError => new InspectionError(message, code);

class InspectionService {
  private inflight = new Map<string, Promise<InspectionOutcome>>();

  run(input: InspectionInput): Promise<InspectionOutcome> {
    if (!input.realm?.trim() || !DATE_RE.test(input.date ?? '')) {
      return Promise.resolve({ ok: false, realm: input.realm ?? '', date: input.date ?? '', reportId: null, error: 'invalid realm/date', elapsedMs: 0 });
    }
    const key = `${input.realm}/${input.date}`;
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const task = this.doRun(input).finally(() => this.inflight.delete(key));
    this.inflight.set(key, task);
    return task;
  }

  private async doRun(input: InspectionInput): Promise<InspectionOutcome> {
    const t0 = Date.now();
    try {
      const reportId = await this.attemptWithRetry(input);
      return { ok: true, realm: input.realm, date: input.date, reportId, error: null, elapsedMs: Date.now() - t0 };
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      logger.error(`[inspection] ${input.realm}/${input.date} failed: ${message}`);
      const reportId = await recordInspectionFailure(input, message);
      void feishuNotifyService.sendText(`[ACM] 巡检失败：${input.realm} ${input.date}（trigger=${input.trigger}）：${message}`);
      return { ok: false, realm: input.realm, date: input.date, reportId, error: message, elapsedMs: Date.now() - t0 };
    } finally {
      clearWorkspace();
    }
  }

  private async attemptWithRetry(input: InspectionInput): Promise<number> {
    let lastError: unknown;
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
      try {
        return await this.attempt(input, attempt);
      } catch (err) {
        lastError = err;
        const code = (err as InspectionError).code;
        if (code === 'budget_exceeded') throw err; // 预算超限重试必然复现，直接失败
        if (attempt < RETRY_DELAYS_MS.length - 1) {
          const delay = RETRY_DELAYS_MS[attempt];
          logger.warn(`[inspection] attempt ${attempt + 1} failed: ${(err as Error).message}, retry in ${delay}ms`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }

  private async attempt(input: InspectionInput, attempt: number): Promise<number> {
    // 分节草稿目录每次 attempt 重建（整轮重试从零开始）；追问轮同 attempt 不清盘，
    // 已落盘的节在追问后仍然有效。draft 位于 /tmp/ai-workspace/{realm}/{date}/_draft，
    // 由 doRun finally 的 clearWorkspace() 一并清理，生命周期自洽。
    const draftDir = reportDraftDir(input.realm, input.date);
    resetDraftDir(draftDir);
    setReportDraftRoot(draftDir);
    try {
      const manifestNote = await this.checkManifest(input.realm, input.date);
      const dataGaps = manifestNote.absent ? ['manifest 缺失（疑似断传）'] : manifestNote.missingTypes.map((t) => `${t} 日志缺失`);
      if (manifestNote.absent || manifestNote.missingTypes.length > 0) {
        void feishuNotifyService.sendText(
          `[ACM] 日志断传告警：${input.realm} ${input.date} ${manifestNote.absent ? 'manifest.json 不存在' : `缺失 ${manifestNote.missingTypes.join('/')}`}，巡检继续分析已有部分。`,
        );
      }

      const cfg = await llmConfigService.resolveDefault();
      const agent = await getAgent(cfg, 'inspection');
      // thread_id 必须每次运行唯一：复用同线程会让模型在 checkpointer 旧上下文里重放上轮结论
      // （T3.6 实测重跑零工具调用），且同线程上下文随重跑次数膨胀推高 token 成本
      const threadId = `inspection-${input.realm}-${input.date}-${Date.now()}-${attempt}`;
      const config = {
        configurable: {
          thread_id: threadId,
          budget: new BudgetGuard(await readRuntimeNumber(SYSTEM_CONFIG_KEYS.aiToolCallBudget, env.AI_TOOL_CALL_BUDGET)),
          refId: `inspection:${input.realm}:${input.date}`,
        },
      };

      const first = await runAgentRound(agent, buildInspectionTaskPrompt(input.realm, input.date, manifestNote), config, toInspectionError);
      let report = this.parseReport(first.text, input.realm, input.date);
      let tokens = first.tokens;
      let durationMs = first.durationMs;
      if (!report) {
        // 最终小 JSON 校验失败追问一轮：带具体错误让模型自我修复，同 thread 保持上下文；
        // 分节结论已落盘仍有效，模型只需重发小 JSON
        logger.warn(`[inspection] first round JSON invalid, asking model to fix`);
        const fixRound = await runAgentRound(
          agent,
          {
            messages: [
              {
                role: 'user',
                content: `你上一轮的输出无法解析为符合约定的 JSON，问题：${this.parseError(first.text, input.realm, input.date)}。请重新只输出最终小 JSON：从 { 开始到 } 结束的一个完整对象，仅含 schemaVersion/reportDate/realm/healthScore/summary 五个字段，不要使用 markdown 代码块，不要续写上文，不要输出任何解释文字。三个分节结论你已通过 write_report_section 落盘，无需重复。`,
              },
            ],
          },
          config,
          toInspectionError,
        );
        // 计量口径：修复轮 tokens/耗时累加，不覆盖
        tokens = sumTokens(first.tokens, fixRound.tokens);
        durationMs += fixRound.durationMs;
        report = this.parseReport(fixRound.text, input.realm, input.date);
      }
      if (!report) throw new InspectionError('agent 两轮输出均不符合报告 schema', 'schema_mismatch');

      const markdown = renderInspectionMarkdown(report);
      return await persistInspection(input, report, markdown, { model: cfg.modelName, tokens, durationMs }, dataGaps);
    } finally {
      clearReportDraftRoot();
    }
  }

  // 步骤 1：断传检查。manifest 读取失败视为不存在（降级继续，不让 COS 故障中止巡检）
  private async checkManifest(realm: string, date: string): Promise<{ absent: boolean; missingTypes: string[] }> {
    try {
      const manifest = await cosGetObjectJson<{ files?: { type: string }[] }>(manifestKey(realm, date));
      if (!manifest) return { absent: true, missingTypes: [] };
      const present = new Set((manifest.files ?? []).map((f) => f.type));
      return { absent: false, missingTypes: LOG_TYPES.filter((t) => !present.has(t)) };
    } catch (err) {
      logger.warn(`[inspection] manifest check failed: ${(err as Error).message}`);
      return { absent: true, missingTypes: [] };
    }
  }

  // 两段式：① 最终小 JSON 校验（五字段，失败返回 null 走追问轮）；② 读分节草稿组装
  // 完整报告。缺节属结构性失败（追问轮无法凭空补数据），抛 report_incomplete 触发整轮重试。
  parseReport(text: string, realm: string, date: string): InspectionReportJson | null {
    const obj = extractJson(text);
    const issues = validateFinalJson(obj, realm, date);
    if (issues.length > 0) {
      // 记录原始输出片段：schema 拒绝在生产环境必须可回溯诊断
      logger.warn(`[inspection] final JSON issues: ${issues.join('; ')} | raw head: ${text.slice(0, 400)}`);
      return null;
    }
    let sections;
    try {
      sections = readDraftedSections(reportDraftDir(realm, date));
    } catch (err) {
      logger.warn(`[inspection] draft sections invalid: ${(err as Error).message}`);
      throw new InspectionError((err as Error).message, 'report_incomplete');
    }
    if (sections.missing.length > 0) {
      logger.warn(`[inspection] report missing sections: ${sections.missing.join(', ')}`);
      throw new InspectionError(`报告缺节：${sections.missing.join(' / ')}（agent 未调用 write_report_section 落盘这些节）`, 'report_incomplete');
    }
    return assembleReport(obj as ReportFinalJson, sections);
  }

  parseError(text: string, realm: string, date: string): string {
    const obj = extractJson(text);
    if (!obj || typeof obj !== 'object') return '未找到 JSON 对象（需要以 { 开始、} 结束的完整 JSON）';
    const issues = validateFinalJson(obj, realm, date);
    return issues.length > 0 ? issues.join('；') : 'JSON 解析失败';
  }
}

export const inspectionService = new InspectionService();

// 对话触发工具的执行体注入（依赖方向 services → agent）：工具壳在 agent/tools/inspection-tools，
// 本服务提供真实编排；模块加载即注入，chat 会话构建 agent 前必经本模块。
setInspectionRunner((input) => inspectionService.run(input));
