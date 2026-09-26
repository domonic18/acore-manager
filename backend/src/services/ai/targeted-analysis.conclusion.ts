import { logger } from '@/middleware/request-logger';
import { extractJson } from '@/shared/utils/extract-json.util';

// 定向分析结论 JSON 契约（纯函数模块，targeted-analysis.service 拆分）：
// 宽容校验（仅拒绝语义性错误：echo 不一致、枚举越界、缺关键字段）+ 误报强制降级。
// subject 只需回显四字段，服务入参结构兼容即可。

export const SUGGESTIONS = ['maintain', 'lift', 'downgrade', 'manual_review'] as const;
export type AnalysisSuggestion = (typeof SUGGESTIONS)[number];

export interface AnalysisConclusion {
  subjectType: string;
  subjectName: string;
  timeRange: { from: string; to: string };
  violations: { type: string; count: number; confirmed: boolean; note?: string }[];
  falsePositiveSignals: string[];
  evidence: { source: string; quote: string }[];
  suggestion: AnalysisSuggestion;
  suggestionReason: string;
  markdown?: string;
}

export interface ConclusionSubject {
  subjectType: 'character' | 'account';
  subjectName: string;
  timeFrom: string;
  timeTo: string;
}

function normalizeText(v: unknown): string {
  return String(v ?? '').trim();
}

// 宽容校验：仅拒绝语义性错误（echo 不一致、枚举越界、缺关键字段）
function validate(c: Partial<AnalysisConclusion>, subject: ConclusionSubject): string[] {
  const issues: string[] = [];
  if (normalizeText(c.subjectType) !== subject.subjectType) issues.push(`subjectType 必须为 "${subject.subjectType}"`);
  if (normalizeText(c.subjectName) !== subject.subjectName) issues.push(`subjectName 必须为 "${subject.subjectName}"`);
  if (normalizeText(c.timeRange?.from) !== subject.timeFrom || normalizeText(c.timeRange?.to) !== subject.timeTo) {
    issues.push(`timeRange 必须为 {from: "${subject.timeFrom}", to: "${subject.timeTo}"}`);
  }
  if (!SUGGESTIONS.includes(c.suggestion as AnalysisSuggestion)) {
    issues.push(`suggestion 必须为 ${SUGGESTIONS.join('/')}`);
  }
  if (!normalizeText(c.suggestionReason)) issues.push('suggestionReason 不能为空');
  if (!Array.isArray(c.violations)) issues.push('violations 必须为数组');
  if (!Array.isArray(c.falsePositiveSignals)) issues.push('falsePositiveSignals 必须为数组');
  if (!Array.isArray(c.evidence)) issues.push('evidence 必须为数组');
  return issues;
}

export function parseConclusion(text: string, subject: ConclusionSubject): AnalysisConclusion | null {
  const obj = extractJson(text);
  if (!obj || typeof obj !== 'object') {
    logger.warn(`[analysis] no JSON object in agent output (len=${text.length})`);
    return null;
  }
  if (validate(obj as Partial<AnalysisConclusion>, subject).length > 0) return null;
  const c = obj as AnalysisConclusion;
  return enforceFalsePositiveRule({
    subjectType: normalizeText(c.subjectType),
    subjectName: normalizeText(c.subjectName),
    timeRange: { from: normalizeText(c.timeRange?.from), to: normalizeText(c.timeRange?.to) },
    violations: Array.isArray(c.violations) ? c.violations : [],
    falsePositiveSignals: Array.isArray(c.falsePositiveSignals) ? c.falsePositiveSignals.map(normalizeText).filter(Boolean) : [],
    evidence: Array.isArray(c.evidence) ? c.evidence : [],
    suggestion: c.suggestion,
    suggestionReason: normalizeText(c.suggestionReason),
    markdown: typeof c.markdown === 'string' ? c.markdown : undefined,
  });
}

export function describeIssues(text: string, subject: ConclusionSubject): string {
  const obj = extractJson(text);
  if (!obj || typeof obj !== 'object') return '未找到 JSON 对象（需要以 { 开始、} 结束的完整 JSON）';
  const issues = validate(obj as Partial<AnalysisConclusion>, subject);
  return issues.length > 0 ? issues.join('；') : 'JSON 解析失败';
}

// 确定性降级（需求 3.8 / arch 8.3）：存在未排除误报信号时不得建议维持封禁
export function enforceFalsePositiveRule(c: AnalysisConclusion): AnalysisConclusion {
  if (c.falsePositiveSignals.length > 0 && c.suggestion === 'maintain') {
    return {
      ...c,
      suggestion: 'manual_review',
      suggestionReason: `${c.suggestionReason}（存在未排除的误报信号，已按规则由 maintain 降级为 manual_review）`,
    };
  }
  return c;
}
