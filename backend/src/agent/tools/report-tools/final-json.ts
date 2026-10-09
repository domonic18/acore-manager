import { z } from 'zod';
import { REPORT_SCHEMA_VERSION, type InspectionReportJson, type ReportFinalJson } from './sections';
import type { DraftedSections } from './draft-store';

// 最终小 JSON 契约单一真源（schema 级系统化）：submit_final_report 提交工具与代码层兜底校验
// 共用同一 zod schema。宽容归一化（数值/字符串 coerce + trim，与旧手写校验语义一致），
// 仅拒绝语义性错误；schemaVersion/realm/reportDate 等值校验经 schema 工厂注入期望值完成。

function schemaVersionField() {
  return z.coerce
    .number()
    .refine((v) => v === REPORT_SCHEMA_VERSION, { message: `schemaVersion 必须为 ${REPORT_SCHEMA_VERSION}` });
}

function healthScoreField() {
  return z.coerce
    .number()
    .refine((v) => Number.isFinite(v) && v >= 0 && v <= 100, { message: 'healthScore 必须为 0-100 的数字' });
}

function summaryField() {
  const message = 'summary 不能为空';
  return z
    .string({ required_error: message, invalid_type_error: message })
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, { message });
}

function nameField(label: 'reportDate' | 'realm', expected?: string) {
  const message = expected ? `${label} 必须为 "${expected}"` : `${label} 必须为非空字符串`;
  return z
    .string({ required_error: message, invalid_type_error: message })
    .transform((v) => v.trim())
    .refine((v) => v.length > 0 && (!expected || v === expected), { message });
}

function buildFields(expected?: { realm: string; date: string }) {
  return {
    schemaVersion: schemaVersionField(),
    reportDate: nameField('reportDate', expected?.date),
    realm: nameField('realm', expected?.realm),
    healthScore: healthScoreField(),
    summary: summaryField(),
  };
}

/** 五字段纯形状（不含 realm/reportDate 等值校验）：submit_final_report 工具注册 schema。 */
export const FinalReportJsonShapeSchema = z.object(buildFields());

/** 注入期望 realm/date 的完整校验 schema：代码层兜底校验（validateFinalJson）使用。 */
export function finalReportJsonSchema(expected: { realm: string; date: string }) {
  return z.object(buildFields(expected));
}

/** 最终小 JSON 校验：五字段宽容归一化，返回问题清单（空数组 = 通过）。 */
export function validateFinalJson(obj: unknown, realm: string, date: string): string[] {
  const verdict = finalReportJsonSchema({ realm, date }).safeParse(obj);
  if (verdict.success) return [];
  // 非对象输入（null/数组/字符串）沿用旧契约的单条错误，不叠加字段级信息
  if (verdict.error.issues.some((i) => i.code === 'invalid_type' && i.path.length === 0)) {
    return ['最终输出必须为一个 JSON 对象'];
  }
  return [...new Set(verdict.error.issues.map((i) => i.message))];
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
