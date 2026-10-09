import { LOG_TYPES } from '@/agent/tools/log-tools/log-workspace';
import { loadPromptPart, renderTemplate } from '@/agent/core/prompt-loader';
import { REPORT_SCHEMA_VERSION } from '@/agent/tools/report-tools';

// 巡检任务提示词装配（纯函数，inspection.service 拆分）：文案真源在 agent/prompts/inspection.yaml
// （系统提示词 + 任务模板 + 修复/抢救追问轮），本模块只计算分支变量（manifest 三态）并渲染 {{var}} 占位符。

export function buildInspectionTaskPrompt(
  realm: string,
  date: string,
  manifest: { absent: boolean; missingTypes: string[] },
): { messages: { role: string; content: string }[] } {
  const manifestNote = manifest.absent
    ? `当日 manifest.json 不存在（疑似断传）。请先用 get_log_manifest 复核；若确认无日志，报告如实说明并给 healthScore 低分。`
    : manifest.missingTypes.length > 0
      ? `当日日志不完整：仅部分类型可用，缺失 ${manifest.missingTypes.join(' / ')}。只分析已有部分，并在落盘分节中说明缺失项。`
      : `当日四类日志齐全（${LOG_TYPES.join(' / ')}）。`;
  const content = renderTemplate(loadPromptPart('inspection', 'taskTemplate'), {
    realm,
    date,
    manifestNote,
    schemaVersion: String(REPORT_SCHEMA_VERSION),
  });
  return { messages: [{ role: 'user', content }] };
}

// 最终提交校验失败追问轮：issues 由代码层 schema 校验错误清单拼装（schema 驱动，不手写修复话术），
// 文案模板见 inspection.yaml followups.jsonFix
export function buildJsonFixPrompt(issues: string): { messages: { role: string; content: string }[] } {
  return { messages: [{ role: 'user', content: renderTemplate(loadPromptPart('inspection', 'followups.jsonFix'), { issues }) }] };
}

// 分节抢救轮：JSON 已合规但草稿缺节时，同线程追问落盘挽回整轮工作
// （SquadSight「缺失清单 + 局部修补」模式）——分析结论仍留在上下文中，只差落盘动作
export function buildSectionSalvagePrompt(missing: readonly string[]): { messages: { role: string; content: string }[] } {
  return {
    messages: [{ role: 'user', content: renderTemplate(loadPromptPart('inspection', 'followups.sectionSalvage'), { missing: missing.join(' / ') }) }],
  };
}
