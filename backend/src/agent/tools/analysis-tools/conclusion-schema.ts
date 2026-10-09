import { z } from 'zod';

// 定向分析结论 JSON 契约单一真源（schema 级系统化）：submit_conclusion 提交工具与
// services/ai/targeted-analysis.conclusion 的文本兜底解析共用本 schema。
// 宽容归一化（trim / 数值与布尔 coerce / 字符串数组过滤空项），仅拒绝语义性错误
// （echo 不一致、枚举越界、缺关键字段）；echo 等值校验经 schema 工厂注入期望 subject 完成。
// 纯域模块：services 可 import，本模块不得 import services。

export const SUBJECT_TYPES = ['character', 'account'] as const;
export const SUGGESTIONS = ['maintain', 'lift', 'downgrade', 'manual_review'] as const;
export type AnalysisSuggestion = (typeof SUGGESTIONS)[number];

export interface ConclusionSubject {
  subjectType: 'character' | 'account';
  subjectName: string;
  timeFrom: string;
  timeTo: string;
}

export interface AnalysisConclusionData {
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

const SUGGESTION_MESSAGE = `suggestion 必须为 ${SUGGESTIONS.join('/')}`;

// confirmed 宽容布尔：字符串 "false" 必须解析为 false（Boolean("false")===true 陷阱）
const boolish = z
  .union([z.boolean(), z.string(), z.number()])
  .transform((v) => v === true || v === 'true' || v === 1);

const violationEntry = z
  .object({
    type: z.string(),
    count: z.coerce.number(),
    confirmed: boolish,
    note: z.string().optional(),
  })
  .passthrough();

const evidenceEntry = z
  .object({
    source: z.string(),
    quote: z.string(),
  })
  .passthrough();

function echoField(label: string, expected?: string) {
  const message = expected ? `${label} 必须为 "${expected}"` : `${label} 不能为空`;
  return z
    .string({ required_error: message, invalid_type_error: message })
    .transform((v) => v.trim())
    .refine((v) => v.length > 0 && (!expected || v === expected), { message });
}

function timeRangeField(subject?: ConclusionSubject) {
  const message = subject
    ? `timeRange 必须为 {from: "${subject.timeFrom}", to: "${subject.timeTo}"}`
    : 'timeRange 必须为对象 {from, to}';
  const bound = (expected?: string) =>
    z
      .string({ required_error: message, invalid_type_error: message })
      .transform((v) => v.trim())
      .refine((v) => !expected || v === expected, { message });
  return z.object({ from: bound(subject?.timeFrom), to: bound(subject?.timeTo) }, { required_error: message, invalid_type_error: message });
}

function violationsField() {
  const message = 'violations 必须为数组';
  return z.array(violationEntry, { required_error: message, invalid_type_error: message });
}

function falsePositiveSignalsField() {
  const message = 'falsePositiveSignals 必须为数组';
  return z
    .array(z.string({ invalid_type_error: 'falsePositiveSignals 条目必须为字符串' }).transform((v) => v.trim()), {
      required_error: message,
      invalid_type_error: message,
    })
    .transform((arr) => arr.filter((v) => v.length > 0));
}

function evidenceField() {
  const message = 'evidence 必须为数组';
  return z.array(evidenceEntry, { required_error: message, invalid_type_error: message });
}

function suggestionField() {
  return z.enum(SUGGESTIONS, { errorMap: () => ({ message: SUGGESTION_MESSAGE }) });
}

function suggestionReasonField() {
  const message = 'suggestionReason 不能为空';
  return z
    .string({ required_error: message, invalid_type_error: message })
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, { message });
}

function subjectTypeField(subject?: ConclusionSubject) {
  // 工具形状用严格 enum（生成期硬约束）；文本兜底用 trim+等值（保持旧行为对空白漂移的宽容）
  if (!subject) {
    return z.enum(SUBJECT_TYPES, { errorMap: () => ({ message: `subjectType 必须为 ${SUBJECT_TYPES.join('/')}` }) });
  }
  const message = `subjectType 必须为 "${subject.subjectType}"`;
  return z
    .string({ required_error: message, invalid_type_error: message })
    .transform((v) => v.trim())
    .refine((v) => v === subject.subjectType, { message });
}

function buildFields(subject?: ConclusionSubject) {
  return {
    subjectType: subjectTypeField(subject),
    subjectName: echoField('subjectName', subject?.subjectName),
    timeRange: timeRangeField(subject),
    violations: violationsField(),
    falsePositiveSignals: falsePositiveSignalsField(),
    evidence: evidenceField(),
    suggestion: suggestionField(),
    suggestionReason: suggestionReasonField(),
    markdown: z.string().optional(),
  };
}

/** 结论纯形状（不含 subject 回显等值校验）：submit_conclusion 工具注册 schema。 */
export const AnalysisConclusionShapeSchema = z.object(buildFields());

/** 注入期望 subject 的完整校验 schema：文本兜底解析（parseConclusion/describeIssues）使用。 */
export function analysisConclusionSchema(subject: ConclusionSubject) {
  return z.object(buildFields(subject));
}
