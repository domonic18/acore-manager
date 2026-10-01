import { REPORT_SCHEMA_VERSION, type InspectionReportJson, type ReportFinalJson } from './sections';
import type { DraftedSections } from './draft-store';

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
