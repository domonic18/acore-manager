import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { registerTool } from '@/agent/tools/registry';
import { WORKSPACE_ROOT } from '@/agent/tools/log-tools/log-workspace';

// 巡检报告分段落盘契约（借鉴 SquadSight：边运行边写文件 + 代码层整理入库）。
// agent 每完成一个维度即调 write_report_section 把该节结论落盘为草稿 JSON，
// 最终消息只输出五字段小 JSON；缺节校验、宽容清洗、组装、Markdown 渲染全部在
// 本模块代码层完成——单次 LLM 输出从 ~17k 字符降到 ~300，规避 maxTokens 腰斩。
// 纯域模块：services/ai/inspection.service 可 import，本模块不得 import services。

export const REPORT_SCHEMA_VERSION = 2;

export const REPORT_SECTIONS = ['server-health', 'suspicious-players', 'recommendations'] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];

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

/** agent 结束消息唯一允许输出的五字段小 JSON */
export interface ReportFinalJson {
  schemaVersion: number;
  reportDate: string;
  realm: string;
  healthScore: number;
  summary: string;
}

const SECTION_FILE: Record<ReportSection, string> = {
  'server-health': 'server-health.json',
  'suspicious-players': 'suspicious-players.json',
  recommendations: 'recommendations.json',
};

const MAX_PLAYERS = 30; // 硬上限：超限报错让模型按严重度裁剪
const TARGET_PLAYERS = 15;
const MAX_EVIDENCE_PER_PLAYER = 5;
const MAX_RECOMMENDATIONS = 20;
const MAX_RECOMMENDATION_LENGTH = 200;

const SEVERITIES: readonly string[] = ['high', 'medium', 'low'];
const ACTIONS: readonly string[] = ['warning', 'investigate', 'ban'];

type SanitizeResult<T> = { ok: true; value: T } | { ok: false; error: string };

// ---- 草稿目录（模块态注入，同 setInspectionRunner 模式；巡检进程串行 + inflight 去重）----

let draftRoot: string | null = null;

export function reportDraftDir(realm: string, date: string): string {
  return join(WORKSPACE_ROOT, realm, date, '_draft');
}

export function setReportDraftRoot(dir: string): void {
  draftRoot = dir;
}

export function clearReportDraftRoot(): void {
  draftRoot = null;
}

export function resetDraftDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

function requireDraftRoot(): string {
  if (!draftRoot) throw new Error('报告草稿目录未就绪（write_report_section 仅限巡检任务内调用）');
  return draftRoot;
}

// ---- 宽容清洗（SquadSight _sanitize 风格：trim / clamp / 归一化；仅语义性错误拒绝）----

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v).trim()).filter((v) => v.length > 0);
}

export function sanitizeServerHealth(raw: unknown): SanitizeResult<InspectionReportJson['serverHealth']> {
  if (raw === undefined || raw === null) return { ok: true, value: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'server-health 必须为对象：{"crashes":[],"errors":[],"authAnomalies":[]}' };
  }
  const value: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    value[key] = Array.isArray(v) ? v : [v];
  }
  return { ok: true, value: value as InspectionReportJson['serverHealth'] };
}

export function sanitizeSuspiciousPlayers(raw: unknown): SanitizeResult<SuspiciousPlayer[]> {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'suspicious-players 必须为玩家对象数组' };
  if (raw.length > MAX_PLAYERS) {
    return {
      ok: false,
      error: `suspicious-players 共 ${raw.length} 条，超过硬上限 ${MAX_PLAYERS} 条：请按严重度只保留最可疑的 top ${TARGET_PLAYERS} 名玩家后重新提交本节`,
    };
  }
  const players: SuspiciousPlayer[] = [];
  const issues: string[] = [];
  raw.forEach((item, idx) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      issues.push(`suspiciousPlayers[${idx}] 必须为对象`);
      return;
    }
    const p = item as Record<string, unknown>;
    const character = typeof p.character === 'string' ? p.character.trim() : '';
    if (!character) {
      issues.push(`suspiciousPlayers[${idx}].character 不能为空`);
      return;
    }
    const severity = typeof p.severity === 'string' ? p.severity.trim().toLowerCase() : '';
    if (!SEVERITIES.includes(severity)) {
      issues.push(`suspiciousPlayers[${idx}].severity 必须为 high|medium|low`);
      return;
    }
    const action = typeof p.suggestedAction === 'string' ? p.suggestedAction.trim().toLowerCase() : '';
    if (!ACTIONS.includes(action)) {
      issues.push(`suspiciousPlayers[${idx}].suggestedAction 必须为 warning|investigate|ban`);
      return;
    }
    const falsePositiveSignals = Array.isArray(p.falsePositiveSignals) ? p.falsePositiveSignals : [];
    // 误报信号非空时禁止自动 ban（提示词硬性要求的代码兜底），降级为人工调查
    const suggestedAction = falsePositiveSignals.length > 0 && action === 'ban' ? 'investigate' : action;
    const player: SuspiciousPlayer = {
      character,
      severity: severity as SuspiciousPlayer['severity'],
      suggestedAction: suggestedAction as SuspiciousPlayer['suggestedAction'],
      reasons: asStringArray(p.reasons),
      evidence: asStringArray(p.evidence).slice(0, MAX_EVIDENCE_PER_PLAYER),
      falsePositiveSignals,
    };
    if (typeof p.account === 'string' && p.account.trim()) player.account = p.account.trim();
    if (typeof p.suggestion === 'string' && p.suggestion.trim()) player.suggestion = p.suggestion.trim();
    players.push(player);
  });
  if (issues.length > 0) return { ok: false, error: issues.join('；') };
  return { ok: true, value: players };
}

export function sanitizeRecommendations(raw: unknown): SanitizeResult<string[]> {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'recommendations 必须为字符串数组' };
  const value = raw
    .map((v) => String(v).trim().slice(0, MAX_RECOMMENDATION_LENGTH))
    .filter((v) => v.length > 0)
    .slice(0, MAX_RECOMMENDATIONS);
  return { ok: true, value };
}

export function validateSection(section: ReportSection, content: unknown): SanitizeResult<unknown> {
  switch (section) {
    case 'server-health':
      return sanitizeServerHealth(content);
    case 'suspicious-players':
      return sanitizeSuspiciousPlayers(content);
    case 'recommendations':
      return sanitizeRecommendations(content);
  }
}

// ---- 写节工具执行体 / 读草稿 / 组装 ----

/** write_report_section 工具执行体：校验该节 → 落盘 {section}.json（已存在则整节覆盖）。校验失败抛错（经注册表转 {error} 交模型重写）。 */
export function writeReportSection(section: ReportSection, content: unknown): { ok: true; section: ReportSection; bytes: number } {
  const dir = requireDraftRoot();
  const verdict = validateSection(section, content);
  if (!verdict.ok) throw new Error(verdict.error);
  mkdirSync(dir, { recursive: true });
  const body = JSON.stringify(verdict.value, null, 2);
  writeFileSync(join(dir, SECTION_FILE[section]), body, 'utf8');
  return { ok: true, section, bytes: Buffer.byteLength(body) };
}

export interface DraftedSections {
  serverHealth?: InspectionReportJson['serverHealth'];
  suspiciousPlayers?: SuspiciousPlayer[];
  recommendations?: string[];
  missing: ReportSection[];
}

/** 读三节草稿（写入时已校验，此处再过一遍清洗保证入库数据干净），missing 列出未落盘节。 */
export function readDraftedSections(dir: string): DraftedSections {
  const result: DraftedSections = { missing: [] };
  for (const section of REPORT_SECTIONS) {
    const file = join(dir, SECTION_FILE[section]);
    if (!existsSync(file)) {
      result.missing.push(section);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`报告草稿 ${SECTION_FILE[section]} 不是合法 JSON：${(err as Error).message}`, { cause: err });
    }
    const verdict = validateSection(section, parsed);
    if (!verdict.ok) throw new Error(`报告草稿 ${SECTION_FILE[section]} 未通过校验：${verdict.error}`);
    if (section === 'server-health') result.serverHealth = verdict.value as InspectionReportJson['serverHealth'];
    else if (section === 'suspicious-players') result.suspiciousPlayers = verdict.value as SuspiciousPlayer[];
    else result.recommendations = verdict.value as string[];
  }
  return result;
}

/** 最终小 JSON 校验：五字段宽容归一化，返回问题清单（空数组 = 通过）。 */
export function validateFinalJson(obj: unknown, realm: string, date: string): string[] {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return ['最终输出必须为一个 JSON 对象'];
  const issues: string[] = [];
  const r = obj as Record<string, unknown>;
  if (r.schemaVersion !== REPORT_SCHEMA_VERSION) issues.push(`schemaVersion 必须为 ${REPORT_SCHEMA_VERSION}`);
  if (typeof r.reportDate !== 'string' || r.reportDate.trim() !== date) issues.push(`reportDate 必须为 "${date}"`);
  if (typeof r.realm !== 'string' || r.realm.trim() !== realm) issues.push(`realm 必须为 "${realm}"`);
  const score = Number(r.healthScore);
  if (!Number.isFinite(score) || score < 0 || score > 100) issues.push('healthScore 必须为 0-100 的数字');
  if (typeof r.summary !== 'string' || !r.summary.trim()) issues.push('summary 不能为空');
  return issues;
}

export function assembleReport(finalJson: ReportFinalJson, sections: DraftedSections): InspectionReportJson {
  if (sections.missing.length > 0) {
    throw new Error(`报告缺节：${sections.missing.join(' / ')}（agent 未调用 write_report_section 落盘这些节）`);
  }
  return {
    schemaVersion: finalJson.schemaVersion,
    reportDate: finalJson.reportDate,
    realm: finalJson.realm,
    generatedAt: new Date().toISOString(),
    healthScore: Math.round(Number(finalJson.healthScore)),
    summary: finalJson.summary.trim(),
    serverHealth: sections.serverHealth ?? {},
    suspiciousPlayers: sections.suspiciousPlayers ?? [],
    recommendations: sections.recommendations ?? [],
  };
}

// ---- 唯一 Markdown 渲染器（代码确定性渲染，模型不再输出全文）----

export function renderInspectionMarkdown(report: InspectionReportJson): string {
  const lines: string[] = [
    `# ${report.realm} ${report.reportDate} 巡检报告`,
    '',
    '## 总体评估',
    '',
    `**健康评分：${report.healthScore}/100**`,
    '',
    report.summary.trim(),
    '',
    '## 服务器健康',
    '',
  ];
  const sh = report.serverHealth ?? {};
  let healthRendered = false;
  for (const [label, items] of [
    ['崩溃事件', sh.crashes],
    ['错误日志', sh.errors],
    ['认证异常', sh.authAnomalies],
  ] as [string, unknown[] | undefined][]) {
    if (!items || items.length === 0) continue;
    healthRendered = true;
    lines.push(`### ${label}（${items.length} 条）`, '');
    for (const item of items) lines.push(`- ${typeof item === 'string' ? item : JSON.stringify(item)}`);
    lines.push('');
  }
  if (!healthRendered) lines.push('当日无崩溃 / 错误 / 认证异常记录。', '');

  lines.push(`## 作弊检测（可疑玩家 ${report.suspiciousPlayers.length} 名）`, '');
  if (report.suspiciousPlayers.length === 0) lines.push('未发现可疑玩家。', '');
  for (const p of report.suspiciousPlayers) {
    lines.push(`### ${p.character}（severity=${p.severity} → ${p.suggestedAction}）`, '');
    if (p.account) lines.push(`- 账号：${p.account}`);
    if (p.reasons.length > 0) {
      lines.push('- 疑似原因：');
      for (const r of p.reasons) lines.push(`  - ${r}`);
    }
    if (p.evidence.length > 0) {
      lines.push('- 证据摘录：');
      for (const e of p.evidence) lines.push(`  - \`${e}\``);
    }
    if (p.falsePositiveSignals.length > 0) {
      lines.push('- 误报信号：');
      for (const f of p.falsePositiveSignals) lines.push(`  - ${typeof f === 'string' ? f : JSON.stringify(f)}`);
    }
    if (p.suggestion) lines.push(`- 处置建议：${p.suggestion}`);
    lines.push('');
  }

  lines.push('## 处置建议', '');
  if (report.recommendations.length === 0) lines.push('无。');
  for (const r of report.recommendations) lines.push(`- ${r}`);
  return lines.join('\n');
}

// ---- 工具注册 ----

export function registerReportTools(): void {
  registerTool({
    name: 'write_report_section',
    description:
      '将巡检报告的一个分节结论落盘（server-health / suspicious-players / recommendations）。' +
      '每完成一个维度的分析必须立即调用本工具记录结论（禁止攒到最后一次性输出）；同一 section 再次调用为整节覆盖重写。' +
      'content 为该节 JSON 数据（禁止包成文本字符串）：' +
      'server-health={"crashes":[],"errors":[],"authAnomalies":[]}；' +
      'suspicious-players=[{character,account,severity:"high|medium|low",suggestedAction:"warning|investigate|ban",reasons:[],evidence:[原文摘录],falsePositiveSignals:[],suggestion}]（按严重度 top ≤15，每人 evidence ≤5 条）；' +
      'recommendations=["…"]（≤20 条，每条 ≤200 字）。',
    schema: z.object({
      section: z.enum(REPORT_SECTIONS).describe('分节名'),
      content: z.unknown().describe('该节结论 JSON（对象或数组）'),
    }),
    handler: async (args) => {
      const { section, content } = args as { section: ReportSection; content: unknown };
      return writeReportSection(section, content);
    },
  });
}
