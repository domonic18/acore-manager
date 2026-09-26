import type { InspectionReportJson } from './sections';

// 唯一 Markdown 渲染器（代码确定性渲染，模型不再输出全文）

export function renderInspectionMarkdown(report: InspectionReportJson): string {
  const lines: string[] = [
    `# ${report.realm} ${report.reportDate} 巡检报告`,
    '',
    '## 总体评估',
    '',
    `**健康评分：${report.healthScore}/100**`,
    '',
    report.summary.trim(),
    '',
    '## 服务器健康',
    '',
  ];
  const sh = report.serverHealth ?? {};
  let healthRendered = false;
  for (const [label, items] of [
    ['崩溃事件', sh.crashes],
    ['错误日志', sh.errors],
    ['认证异常', sh.authAnomalies],
  ] as [string, unknown[] | undefined][]) {
    if (!items || items.length === 0) continue;
    healthRendered = true;
    lines.push(`### ${label}（${items.length} 条）`, '');
    for (const item of items) lines.push(`- ${typeof item === 'string' ? item : JSON.stringify(item)}`);
    lines.push('');
  }
  if (!healthRendered) lines.push('当日无崩溃 / 错误 / 认证异常记录。', '');

  lines.push(`## 作弊检测（可疑玩家 ${report.suspiciousPlayers.length} 名）`, '');
  if (report.suspiciousPlayers.length === 0) lines.push('未发现可疑玩家。', '');
  for (const p of report.suspiciousPlayers) {
    lines.push(`### ${p.character}（severity=${p.severity} → ${p.suggestedAction}）`, '');
    if (p.account) lines.push(`- 账号：${p.account}`);
    if (p.reasons.length > 0) {
      lines.push('- 疑似原因：');
      for (const r of p.reasons) lines.push(`  - ${r}`);
    }
    if (p.evidence.length > 0) {
      lines.push('- 证据摘录：');
      for (const e of p.evidence) lines.push(`  - \`${e}\``);
    }
    if (p.falsePositiveSignals.length > 0) {
      lines.push('- 误报信号：');
      for (const f of p.falsePositiveSignals) lines.push(`  - ${typeof f === 'string' ? f : JSON.stringify(f)}`);
    }
    if (p.suggestion) lines.push(`- 处置建议：${p.suggestion}`);
    lines.push('');
  }

  lines.push('## 处置建议', '');
  if (report.recommendations.length === 0) lines.push('无。');
  for (const r of report.recommendations) lines.push(`- ${r}`);
  return lines.join('\n');
}
