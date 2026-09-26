import { z } from 'zod';
import { registerTool } from '@/agent/tools/registry';
import { REPORT_SECTIONS, type ReportSection } from './sections';
import { writeReportSection } from './draft-store';

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
