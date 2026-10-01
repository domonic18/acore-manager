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
  serverHealth: { crashes?: unknown[]; errors?: unknown[]; authAnomalies?: unknown[]; cheatMarkers?: unknown[] };
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

const MAX_PLAYERS = 30; // 硬上限：超限报错让模型按严重度裁剪
const TARGET_PLAYERS = 15;
const MAX_EVIDENCE_PER_PLAYER = 5;
const MAX_RECOMMENDATIONS = 20;
const MAX_RECOMMENDATION_LENGTH = 200;

const SEVERITIES: readonly string[] = ['high', 'medium', 'low'];
const ACTIONS: readonly string[] = ['warning', 'investigate', 'ban'];

export type SanitizeResult<T> = { ok: true; value: T } | { ok: false; error: string };

// ---- 宽容清洗（SquadSight _sanitize 风格：trim / clamp / 归一化；仅语义性错误拒绝）----
// 模型传参存在格式漂移（字符串当数组、单对象当单元素数组）——能无歧义修复的统一
// 宽容归一（Postel 输入宽容），只拒绝语义性错误；硬拒会诱发模型误诊后策略摇摆。

function asStringArray(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (typeof raw === 'string') return raw.split('\n').map((v) => v.trim()).filter((v) => v.length > 0);
  if (!Array.isArray(raw)) return [String(raw).trim()].filter((v) => v.length > 0);
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
  // 单玩家对象宽容为单元素数组（模型只发现一人时常见漂移）
  const items = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? [raw] : raw;
  if (!Array.isArray(items)) return { ok: false, error: 'suspicious-players 必须为玩家对象数组（单个玩家对象也会被接受）' };
  if (items.length > MAX_PLAYERS) {
    return {
      ok: false,
      error: `suspicious-players 共 ${items.length} 条，超过硬上限 ${MAX_PLAYERS} 条：请按严重度只保留最可疑的 top ${TARGET_PLAYERS} 名玩家后重新提交本节`,
    };
  }
  const players: SuspiciousPlayer[] = [];
  const issues: string[] = [];
  items.forEach((item, idx) => {
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
    const falsePositiveSignals = Array.isArray(p.falsePositiveSignals)
      ? p.falsePositiveSignals
      : p.falsePositiveSignals !== undefined && p.falsePositiveSignals !== null
        ? [p.falsePositiveSignals]
        : [];
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
  // 多行字符串宽容按行拆分（SquadSight 同款：字符串 → 按行分割为数组）
  const items = typeof raw === 'string' ? raw.split('\n') : raw;
  if (!Array.isArray(items)) return { ok: false, error: 'recommendations 必须为字符串数组（多行字符串也会被接受）' };
  const value = items
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
