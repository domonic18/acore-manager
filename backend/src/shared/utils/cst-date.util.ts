// 上海时区（CST，UTC+8 无夏令时）日期工具。
// 巡检"昨日"必须按 CST 计算：SCF 06:00 CST 触发时容器为 UTC，按 UTC 算会偏一天。

const CST_OFFSET_MS = 8 * 3600 * 1000;

export function yesterdayCST(now: Date = new Date()): string {
  const cst = new Date(now.getTime() + CST_OFFSET_MS);
  cst.setUTCDate(cst.getUTCDate() - 1);
  return cst.toISOString().slice(0, 10);
}
