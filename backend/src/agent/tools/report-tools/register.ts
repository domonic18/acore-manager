import { registerTool } from '@/agent/tools/registry';
import { REPORT_SCHEMA_VERSION } from './sections';
import { writeFinalReport, writeReportSection } from './draft-store';
import { FinalReportJsonShapeSchema } from './final-json';
import {
  RecommendationsArgSchema,
  ServerHealthArgSchema,
  singleObjectToArray,
  SuspiciousPlayersArgSchema,
} from './section-args';

export function registerReportTools(): void {
  registerTool({
    name: 'write_server_health',
    description:
      '将巡检报告的「服务器健康」分节落盘。完成服务器健康维度分析后必须立即调用本工具（禁止攒到最后一次性输出）；' +
      '同一节再次调用为整节覆盖重写。content 为该节 JSON 对象：{"crashes":[],"errors":[],"authAnomalies":[],"cheatMarkers":[]}（无则空数组）。',
    schema: ServerHealthArgSchema,
    handler: async (args) => {
      const { content } = args as { content: unknown };
      return writeReportSection('server-health', content);
    },
  });
  registerTool({
    name: 'write_suspicious_players',
    description:
      '将巡检报告的「可疑玩家」分节落盘。完成反作弊研判后必须立即调用本工具（禁止攒到最后一次性输出）；' +
      '同一节再次调用为整节覆盖重写。content 为玩家对象数组：[{"character","account","severity":"high|medium|low",' +
      '"suggestedAction":"warning|investigate|ban","reasons":[],"evidence":[原文摘录],"falsePositiveSignals":[],' +
      '"suggestion":"...","profile":"游戏时长 x 小时 · 等级 x · 账号注册 N 天"}]（按严重度 top ≤15，每人 evidence ≤5 条；' +
      '只发现一人时可传单个对象，本工具会自动包成数组）。',
    schema: SuspiciousPlayersArgSchema,
    handler: async (args) => {
      const { content } = args as { content: unknown };
      // 单对象已在 schema 层通过 preprocess 包成数组，防御性再包一次保证代码层清洗器输入一致。
      return writeReportSection('suspicious-players', singleObjectToArray(content));
    },
  });
  registerTool({
    name: 'write_recommendations',
    description:
      '将巡检报告的「处置建议」分节落盘。完成处置建议维度后必须立即调用本工具（禁止攒到最后一次性输出）；' +
      '同一节再次调用为整节覆盖重写。content 为字符串数组：["处置建议…"]（≤20 条，每条 ≤200 字；也可传多行字符串，会自动按行拆分）。',
    schema: RecommendationsArgSchema,
    handler: async (args) => {
      const { content } = args as { content: unknown };
      return writeReportSection('recommendations', content);
    },
  });
  registerTool({
    name: 'submit_final_report',
    description:
      '三节全部分节落盘后提交巡检最终结论（唯一出口；提交成功后最终消息只需一句简短确认，不要再输出任何 JSON 文本）。' +
      `参数即五字段：schemaVersion=${REPORT_SCHEMA_VERSION}；reportDate=当日 YYYY-MM-DD；realm=服务器名；` +
      'healthScore=0-100 整数；summary=一段话总结（≤200 字）。',
    schema: FinalReportJsonShapeSchema,
    handler: async (args) => writeFinalReport(args),
  });
}
