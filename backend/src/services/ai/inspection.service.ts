import { acmDataSource } from '@/config/database';
import { env } from '@/config/env';
import { logger } from '@/middleware/request-logger';
import { AiReport } from '@/entities/acm/ai-report.entity';
import { streamAgentEvents } from '@/agent/runtime/wire';
import { getAgent } from '@/agent/runtime/agent-factory';
import { BudgetGuard } from '@/agent/runtime/budget-guard';
import { LOG_TYPES, clearWorkspace, manifestKey } from '@/agent/tools/log-tools/log-workspace';
import { setInspectionRunner } from '@/agent/tools/inspection-tools';
import { cosGetObjectJson, cosPutObjectBuffer } from '@/shared/utils/cos.util';
import { cacheService } from '@/services/cache.service';
import { llmConfigService } from './llm-config.service';
import { tokenUsageService } from './token-usage.service';
import { feishuNotifyService } from './feishu-notify.service';

// 每日巡检编排（arch 3.4）：断传检查 → deep agent 取证（日志 + 白名单工具）→ JSON 报告
// 解析校验（失败追问一轮）→ ai_report 幂等 upsert → COS 归档 → Redis 摘要 → 计量/飞书。
// 失败退避重试（最多 3 次），最终失败落 status=failed 行 + 飞书告警，不阻塞次日。

export const REPORT_SCHEMA_VERSION = 2;
const ARCHIVE_PREFIX = 'acore-ai-reports';
const REPORT_CACHE_TTL_SECONDS = 7 * 24 * 3600;
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

export interface SuspiciousPlayer {
  character: string;
  account?: string;
  severity: 'high' | 'medium' | 'low';
  suggestedAction: 'warning' | 'investigate' | 'ban';
  reasons: string[];
  evidence: string[];
  falsePositiveSignals: unknown[];
  suggestion?: string;
}

export interface InspectionReportJson {
  schemaVersion: number;
  reportDate: string;
  realm: string;
  generatedAt?: string;
  healthScore: number;
  summary: string;
  serverHealth: { crashes?: unknown[]; errors?: unknown[]; authAnomalies?: unknown[] };
  suspiciousPlayers: SuspiciousPlayer[];
  recommendations: string[];
  markdown?: string;
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
      const reportId = await this.recordFailure(input, message);
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
    const manifestNote = await this.checkManifest(input.realm, input.date);
    if (manifestNote.absent || manifestNote.missingTypes.length > 0) {
      void feishuNotifyService.sendText(
        `[ACM] 日志断传告警：${input.realm} ${input.date} ${manifestNote.absent ? 'manifest.json 不存在' : `缺失 ${manifestNote.missingTypes.join('/')}`}，巡检继续分析已有部分。`,
      );
    }

    const cfg = await llmConfigService.resolveDefault();
    const agent = await getAgent(cfg, 'inspection');
    const config = {
      configurable: {
        thread_id: `inspection-${input.realm}-${input.date}-${attempt}`,
        budget: new BudgetGuard(env.AI_TOOL_CALL_BUDGET),
        refId: `inspection:${input.realm}:${input.date}`,
      },
    };

    let { text, tokens, durationMs } = await this.collectAnswer(agent, this.buildTaskPrompt(input.realm, input.date, manifestNote), config);
    let report = this.parseReport(text, input.realm, input.date);
    if (!report) {
      // schema 校验失败追问一轮：带具体错误让模型自我修复，同 thread 保持上下文
      logger.warn(`[inspection] first round JSON invalid, asking model to fix`);
      const fixRound = await this.collectAnswer(
        agent,
        [
          { role: 'user', content: `你上一轮的输出无法解析为符合 schema 的报告 JSON。请检查以下问题并重新输出：${this.parseError(text, input.realm, input.date)}\n只输出修正后的完整 JSON，不要任何其他文字。` },
        ],
        config,
      );
      text = fixRound.text;
      tokens = {
        prompt: tokens.prompt + fixRound.tokens.prompt,
        completion: tokens.completion + fixRound.tokens.completion,
        total: tokens.total + fixRound.tokens.total,
      };
      durationMs += fixRound.durationMs;
      report = this.parseReport(text, input.realm, input.date);
    }
    if (!report) throw new InspectionError('agent 两轮输出均不符合报告 schema', 'schema_mismatch');

    const markdown = report.markdown?.trim() || this.renderMarkdownFallback(report);
    return this.persist(input, report, markdown, { model: cfg.modelName, tokens, durationMs });
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

  private buildTaskPrompt(realm: string, date: string, manifest: { absent: boolean; missingTypes: string[] }): { messages: { role: string; content: string }[] } {
    const manifestNote = manifest.absent
      ? `当日 manifest.json 不存在（疑似断传）。请先用 get_log_manifest 复核；若确认无日志，报告如实说明并给 healthScore 低分。`
      : manifest.missingTypes.length > 0
        ? `当日日志不完整：仅部分类型可用，缺失 ${manifest.missingTypes.join(' / ')}。只分析已有部分，并在报告 markdown 中说明缺失项。`
        : `当日四类日志齐全（${LOG_TYPES.join(' / ')}）。`;
    const content = [
      `请执行 ${realm} 服务器 ${date} 的每日巡检，产出结构化诊断报告。`,
      ``,
      `当日日志清单状态：${manifestNote}`,
      ``,
      `取证步骤建议：`,
      `1. get_log_manifest 复核日志构成`,
      `2. fetch_log_archive 拉取 anticheat 归档（优先）及其他可用类型`,
      `3. parse_anticheat_violations(from, to, explain=true) 做代码级违规聚合与误报解释`,
      `4. 可疑玩家用 get_anticheat_record / get_character_overview / get_character_auras 佐证`,
      `5. 汇总输出报告 JSON`,
      ``,
      `最终必须输出一个 JSON 对象（可置于 \`\`\`json 围栏中），字段：`,
      `- schemaVersion: ${REPORT_SCHEMA_VERSION}（整数）`,
      `- reportDate: "${date}"，realm: "${realm}"（必须与此处完全一致）`,
      `- healthScore: 0-100 整数`,
      `- summary: 一段话总结（≤200 字）`,
      `- serverHealth: {crashes:[], errors:[], authAnomalies:[]}（当日无则为空数组）`,
      `- suspiciousPlayers: [{character, account, severity:"high|medium|low", suggestedAction:"warning|investigate|ban", reasons:[字符串], evidence:[原始日志摘录], falsePositiveSignals:[], suggestion}]（无可疑玩家则为空数组）`,
      `- recommendations: [字符串]`,
      `- markdown: 完整 Markdown 报告全文`,
      ``,
      `硬性要求：falsePositiveSignals 非空的玩家 suggestedAction 不得为 "ban"；证据必须来自工具返回的原文摘录，禁止编造；无日志支撑的维度如实写"无数据"。`,
    ].join('\n');
    return { messages: [{ role: 'user', content }] };
  }

  // 步骤 4：经 streamAgentEvents 消费整轮（与 SSE 同一条映射链路），聚合全文 + token 用量
  private async collectAnswer(
    agent: { streamEvents: (input: unknown, options: Record<string, unknown>) => AsyncIterable<{ event: string; data: Record<string, unknown> }> },
    input: unknown,
    config: Record<string, unknown>,
  ): Promise<{ text: string; tokens: { prompt: number; completion: number; total: number }; durationMs: number }> {
    const t0 = Date.now();
    let text = '';
    let tokens = { prompt: 0, completion: 0, total: 0 };
    for await (const ev of streamAgentEvents(agent as never, input, config)) {
      if (ev.event === 'delta') text += String(ev.data.text ?? '');
      else if (ev.event === 'done') {
        const t = ev.data.tokens as { prompt?: number; completion?: number; total?: number } | undefined;
        tokens = { prompt: t?.prompt ?? 0, completion: t?.completion ?? 0, total: t?.total ?? 0 };
      } else if (ev.event === 'error') {
        throw new InspectionError(String(ev.data.message ?? 'agent error'), String(ev.data.code ?? 'agent_error'));
      }
    }
    return { text, tokens, durationMs: Date.now() - t0 };
  }

  parseReport(text: string, realm: string, date: string): InspectionReportJson | null {
    const obj = extractJson(text);
    if (!obj || typeof obj !== 'object') {
      logger.warn(`[inspection] no JSON object in agent output (len=${text.length}), head: ${text.slice(0, 400)}`);
      return null;
    }
    const issues = this.validate(obj as Partial<InspectionReportJson>, realm, date);
    if (issues.length > 0) {
      // 记录原始输出片段：schema 拒绝在生产环境必须可回溯诊断
      logger.warn(`[inspection] report schema issues: ${issues.join('; ')} | raw head: ${text.slice(0, 500)}`);
      return null;
    }
    const r = obj as InspectionReportJson;
    return {
      ...r,
      realm,
      reportDate: date,
      healthScore: Math.round(Number(r.healthScore)),
      summary: String(r.summary).trim(),
      serverHealth: r.serverHealth ?? {},
      suspiciousPlayers: Array.isArray(r.suspiciousPlayers) ? r.suspiciousPlayers : [],
      recommendations: Array.isArray(r.recommendations) ? r.recommendations : [],
    };
  }

  parseError(text: string, realm: string, date: string): string {
    const obj = extractJson(text);
    if (!obj || typeof obj !== 'object') return '未找到 JSON 对象（需要以 { 开始、} 结束的完整 JSON）';
    const issues = this.validate(obj as Partial<InspectionReportJson>, realm, date);
    return issues.length > 0 ? issues.join('；') : 'JSON 解析失败';
  }

  // 宽容校验：数值字符串、首尾空白、缺失集合字段均可归一化；仅拒绝语义性错误
  private validate(r: Partial<InspectionReportJson>, realm: string, date: string): string[] {
    const issues: string[] = [];
    if (r.schemaVersion !== REPORT_SCHEMA_VERSION) issues.push(`schemaVersion 必须为 ${REPORT_SCHEMA_VERSION}`);
    if (typeof r.reportDate !== 'string' || r.reportDate.trim() !== date) issues.push(`reportDate 必须为 "${date}"`);
    if (typeof r.realm !== 'string' || r.realm.trim() !== realm) issues.push(`realm 必须为 "${realm}"`);
    const score = Number(r.healthScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) issues.push('healthScore 必须为 0-100 的数字');
    if (typeof r.summary !== 'string' || !r.summary.trim()) issues.push('summary 不能为空');
    const sh = r.serverHealth;
    if (sh !== undefined && sh !== null && (typeof sh !== 'object' || Array.isArray(sh))) issues.push('serverHealth 必须为对象');
    if (r.suspiciousPlayers !== undefined && !Array.isArray(r.suspiciousPlayers)) issues.push('suspiciousPlayers 必须为数组');
    if (r.recommendations !== undefined && !Array.isArray(r.recommendations)) issues.push('recommendations 必须为数组');
    return issues;
  }

  // 步骤 6-10：落库（幂等 upsert，token 用量随行）→ COS 归档（失败不阻塞）→ Redis 摘要 → 计量 → 飞书
  private async persist(
    input: InspectionInput,
    report: InspectionReportJson,
    markdown: string,
    usage: { model: string; tokens: { prompt: number; completion: number; total: number }; durationMs: number },
  ): Promise<number> {
    const repo = acmDataSource.getRepository(AiReport);
    const saved = await repo.upsert(
      {
        realm: input.realm,
        reportDate: input.date,
        schemaVersion: report.schemaVersion,
        healthScore: report.healthScore,
        summary: report.summary.slice(0, 500),
        contentJson: { ...report, markdown: undefined } as any,
        contentMarkdown: markdown,
        tokenUsage: usage.tokens as any,
        generatedBy: input.trigger,
        status: 'ok',
      },
      ['realm', 'reportDate'],
    );
    const reportId = Number((saved as unknown as { identifiers?: { id: number }[] })?.identifiers?.[0]?.id ?? 0) || (await this.findReportId(input));

    void tokenUsageService
      .record({
        scene: 'inspection',
        refId: `${input.realm}/${input.date}`,
        model: usage.model,
        promptTokens: usage.tokens.prompt,
        completionTokens: usage.tokens.completion,
        totalTokens: usage.tokens.total,
        durationMs: usage.durationMs,
      })
      .catch((err: unknown) => logger.error(`[inspection] token record failed: ${(err as Error).message}`));

    void this.archiveAndNotify(input, report, markdown).catch((err: unknown) => logger.error(`[inspection] archive/notify failed: ${(err as Error).message}`));
    logger.info(`[inspection] report persisted ${input.realm}/${input.date} healthScore=${report.healthScore} id=${reportId}`);
    return reportId;
  }

  private async findReportId(input: InspectionInput): Promise<number> {
    const row = await acmDataSource.getRepository(AiReport).findOne({ where: { realm: input.realm, reportDate: input.date } });
    return row?.id ?? 0;
  }

  private async archiveAndNotify(input: InspectionInput, report: InspectionReportJson, markdown: string): Promise<void> {
    try {
      const json = { ...report, markdown: undefined, generatedAt: new Date().toISOString() };
      await cosPutObjectBuffer(`${ARCHIVE_PREFIX}/${input.realm}/${input.date}.json`, Buffer.from(JSON.stringify(json, null, 2)), 'application/json');
      await cosPutObjectBuffer(`${ARCHIVE_PREFIX}/${input.realm}/${input.date}.md`, Buffer.from(markdown), 'text/markdown');
    } catch (err) {
      logger.warn(`[inspection] COS archive failed (report kept in DB): ${(err as Error).message}`);
    }

    await cacheService.set(
      `acm:ai:report:latest:${input.realm}`,
      { realm: input.realm, date: input.date, healthScore: report.healthScore, summary: report.summary.slice(0, 500), suspiciousCount: report.suspiciousPlayers.length },
      REPORT_CACHE_TTL_SECONDS,
    );

    // T3.5 日报卡片：评分 / 异常数 / 可疑数 / TOP 风险 / 报告链接（基础地址未配置则无跳转按钮）
    void feishuNotifyService.sendDailyReportCard({
      realm: input.realm,
      date: input.date,
      trigger: input.trigger,
      healthScore: report.healthScore,
      summary: report.summary,
      serverHealth: report.serverHealth,
      suspiciousPlayers: report.suspiciousPlayers,
    });
  }

  private async recordFailure(input: InspectionInput, message: string): Promise<number | null> {
    try {
      const repo = acmDataSource.getRepository(AiReport);
      const saved = await repo.upsert(
        {
          realm: input.realm,
          reportDate: input.date,
          schemaVersion: REPORT_SCHEMA_VERSION,
          healthScore: 0,
          summary: `巡检失败：${message}`.slice(0, 500),
          contentJson: { error: message } as any,
          contentMarkdown: '',
          tokenUsage: null,
          generatedBy: input.trigger,
          status: 'failed',
        },
        ['realm', 'reportDate'],
      );
      return Number((saved as unknown as { identifiers?: { id: number }[] })?.identifiers?.[0]?.id ?? 0) || null;
    } catch (err) {
      logger.error(`[inspection] record failure row failed: ${(err as Error).message}`);
      return null;
    }
  }

  private renderMarkdownFallback(report: InspectionReportJson): string {
    const lines: string[] = [
      `# ${report.realm} ${report.reportDate} 巡检报告`,
      '',
      `**健康评分：${report.healthScore}/100**`,
      '',
      report.summary,
      '',
      `## 可疑玩家（${report.suspiciousPlayers.length}）`,
      '',
    ];
    if (report.suspiciousPlayers.length === 0) lines.push('无可疑玩家。');
    for (const p of report.suspiciousPlayers) {
      lines.push(`- **${p.character}**（severity=${p.severity}, action=${p.suggestedAction}）：${(p.reasons ?? []).join('；')}`);
      for (const e of (p.evidence ?? []).slice(0, 3)) lines.push(`  - \`${e}\``);
    }
    lines.push('', '## 建议', '');
    for (const r of report.recommendations ?? []) lines.push(`- ${r}`);
    return lines.join('\n');
  }
}

function extractJson(text: string): unknown | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export const inspectionService = new InspectionService();

// 对话触发工具的执行体注入（依赖方向 services → agent）：工具壳在 agent/tools/inspection-tools，
// 本服务提供真实编排；模块加载即注入，chat 会话构建 agent 前必经本模块。
setInspectionRunner((input) => inspectionService.run(input));
