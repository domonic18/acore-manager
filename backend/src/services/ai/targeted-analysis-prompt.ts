import { loadPromptPart, renderTemplate } from '@/agent/core/prompt-loader';
import type { TargetedAnalysisSubject } from './targeted-analysis.runner';

// 定向分析任务提示词装配（纯函数）：文案真源在 agent/prompts/analysis.yaml
// （系统提示词 + 任务模板 + 修复追问轮），本模块只计算分支变量（封禁背景/对象类型两态）并渲染 {{var}}。

export function buildTargetedAnalysisTaskPrompt(input: TargetedAnalysisSubject): string {
  const banNote = input.banContext?.reason
    ? `封禁背景：${input.banContext.date ?? '未知日期'} 由 ${input.banContext.bannedBy ?? '未知'} 封禁，理由「${input.banContext.reason}」。`
    : '封禁背景：未提供（可能是申诉之外的常规核查）。';
  const subjectNote =
    input.subjectType === 'character'
      ? `分析对象：角色「${input.subjectName}」（${input.realm}）`
      : `分析对象：账号「${input.subjectName}」（${input.realm}，需汇总名下全部角色）`;
  return renderTemplate(loadPromptPart('analysis', 'taskTemplate'), {
    subjectNote,
    banNote,
    realm: input.realm,
    timeFrom: input.timeFrom,
    timeTo: input.timeTo,
    subjectType: input.subjectType,
    subjectName: input.subjectName,
  });
}

// 结论提交校验失败追问轮：issues 由代码层 schema 校验错误清单拼装（schema 驱动，不手写修复话术）
export function buildAnalysisJsonFixPrompt(issues: string): string {
  return renderTemplate(loadPromptPart('analysis', 'followups.jsonFix'), { issues });
}
