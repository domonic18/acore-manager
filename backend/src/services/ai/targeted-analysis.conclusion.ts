import { logger } from '@/middleware/request-logger';
import { extractJson } from '@/shared/utils/extract-json.util';
import {
  analysisConclusionSchema,
  SUGGESTIONS,
  type AnalysisConclusionData,
  type AnalysisSuggestion,
  type ConclusionSubject,
} from '@/agent/tools/analysis-tools/conclusion-schema';

// 定向分析结论 JSON 契约（纯函数模块，targeted-analysis.service 拆分）：
// zod schema 单一真源在 agent/tools/analysis-tools/conclusion-schema（与 submit_conclusion 工具共用），
// 本模块只负责文本兜底解析（extractJson + safeParse）与误报强制降级——仅拒绝语义性错误
// （echo 不一致、枚举越界、缺关键字段）。subject 只需回显四字段，服务入参结构兼容即可。

export type AnalysisConclusion = AnalysisConclusionData;
export { SUGGESTIONS };
export type { AnalysisSuggestion, ConclusionSubject };

export function parseConclusion(text: string, subject: ConclusionSubject): AnalysisConclusion | null {
  const obj = extractJson(text);
  if (!obj || typeof obj !== 'object') {
    logger.warn(`[analysis] no JSON object in agent output (len=${text.length})`);
    return null;
  }
  const verdict = analysisConclusionSchema(subject).safeParse(obj);
  if (!verdict.success) return null;
  return enforceFalsePositiveRule(verdict.data);
}

export function describeIssues(text: string, subject: ConclusionSubject): string {
  const obj = extractJson(text);
  if (!obj || typeof obj !== 'object') return '未找到 JSON 对象（需要以 { 开始、} 结束的完整 JSON）';
  const verdict = analysisConclusionSchema(subject).safeParse(obj);
  if (verdict.success) return 'JSON 解析失败';
  return [...new Set(verdict.error.issues.map((i) => i.message))].join('；');
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
