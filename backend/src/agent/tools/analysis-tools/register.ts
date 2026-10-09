import { registerTool } from '@/agent/tools/registry';
import { AnalysisConclusionShapeSchema } from './conclusion-schema';
import { writeConclusionCapture } from './capture-store';

export function registerAnalysisTools(): void {
  registerTool({
    name: 'submit_conclusion',
    description:
      '定向分析完成后提交最终研判结论（唯一出口；提交成功后最终消息只需一句简短确认，不要再输出结论 JSON 文本）。' +
      '参数即结论各字段：subjectType("character"|"account") 与 subjectName 必须与任务对象完全一致；' +
      'timeRange={from,to}；violations=[{type,count,confirmed,note}]（无违规则空数组）；' +
      'falsePositiveSignals=[未排除的误报信号]；evidence=[{source:来源工具名,quote:原始行摘录}]（禁止编造）；' +
      'suggestion="maintain|lift|downgrade|manual_review"（falsePositiveSignals 非空时必须为 manual_review）；' +
      'suggestionReason=处置理由（覆盖违规/轨迹/IP 关联三维度）；markdown=面向申诉人的完整回复全文。',
    schema: AnalysisConclusionShapeSchema,
    handler: async (args) => writeConclusionCapture(args),
  });
}
