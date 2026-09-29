// 上海时区（CST，UTC+8 无夏令时）日期工具。
// 巡检"昨日"必须按 CST 计算：SCF 06:00 CST 触发时容器为 UTC，按 UTC 算会偏一天。

const CST_OFFSET_MS = 8 * 3600 * 1000;

export function yesterdayCST(now: Date = new Date()): string {
  const cst = new Date(now.getTime() + CST_OFFSET_MS);
  cst.setUTCDate(cst.getUTCDate() - 1);
  return cst.toISOString().slice(0, 10);
}

// 从 DB 读回的 Date 还原成创建时的 YYYY-MM-DD：pg 对 timestamp(无时区) 列按"本地字段"往返，
// 读写两端容器时区一致（均为 UTC），读回的 Date 即写入时的原瞬时值，加 8h 取 CST 日期即可。
export function formatCstDate(d: Date): string {
  return new Date(d.getTime() + CST_OFFSET_MS).toISOString().slice(0, 10);
}
