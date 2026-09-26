import { LOG_TYPES } from '@/agent/tools/log-tools/log-workspace';
import { REPORT_SCHEMA_VERSION } from '@/agent/tools/report-tools';

// 巡检任务提示词（纯函数，inspection.service 拆分）：manifest 状态说明 + 取证步骤建议
// + write_report_section 分节落盘契约 + 五字段最终小 JSON 约定与硬性要求。

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
  const content = [
    `请执行 ${realm} 服务器 ${date} 的每日巡检，产出结构化诊断报告。`,
    ``,
    `当日日志清单状态：${manifestNote}`,
    ``,
    `取证步骤建议：`,
    `1. get_log_manifest 复核日志构成`,
    `2. fetch_log_archive 拉取 anticheat 归档（优先）及其他可用类型`,
    `3. parse_anticheat_violations(from, to, explain=true) 做代码级违规聚合与误报解释`,
    `4. 可疑玩家用 get_anticheat_record / get_character_overview / get_character_auras 佐证`,
    `5. 每完成一个维度立即调用 write_report_section 落盘对应分节，禁止攒到最后一次性输出`,
    ``,
    `分节落盘契约（write_report_section 的 section / content）：`,
    `- "server-health"：{"crashes":[当日崩溃摘要],"errors":[错误统计],"authAnomalies":[认证异常摘要]}（无则空数组）`,
    `- "suspicious-players"：[{"character","account","severity":"high|medium|low","suggestedAction":"warning|investigate|ban","reasons":["…"],"evidence":["原始日志摘录"],"falsePositiveSignals":[],"suggestion":"…"}]，按严重度取 top ≤15 名，每人 evidence ≤5 条`,
    `- "recommendations"：["处置建议…"]（≤20 条，每条 ≤200 字）`,
    ``,
    `三节全部落盘后，最终消息只输出一个五字段小 JSON（可置于 \`\`\`json 围栏中），除此之外不得输出任何明细、markdown 全文或解释文字：`,
    `{"schemaVersion": ${REPORT_SCHEMA_VERSION}, "reportDate": "${date}", "realm": "${realm}", "healthScore": <0-100 整数>, "summary": "<一段话总结，≤200 字>"}`,
    ``,
    `硬性要求：falsePositiveSignals 非空的玩家 suggestedAction 不得为 "ban"；证据必须来自工具返回的原文摘录，禁止编造；无日志支撑的维度如实写"无数据"。`,
  ].join('\n');
  return { messages: [{ role: 'user', content }] };
}
