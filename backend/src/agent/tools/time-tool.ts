import { z } from 'zod';
import { registerTool } from '@/agent/tools/registry';

// 服务器当前时间工具（上海时区）：agent 无内建时钟，涉及"今天/当天/最近 N 天"等
// 相对时间必须先调用本工具换算绝对日期，否则按训练截止时间臆测会查错日期。

const CST_OFFSET_MS = 8 * 3600 * 1000;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function registerTimeTools(): void {
  registerTool({
    name: 'get_current_time',
    description:
      '获取服务器当前日期时间（Asia/Shanghai，UTC+8）。凡涉及"今天/当天/昨日/最近N天"等相对时间，' +
      '必须先调用本工具换算出绝对日期再做后续查询，不要凭模型自身推测日期。',
    schema: z.object({}).strict(),
    handler: async () => {
      const now = new Date();
      const cst = new Date(now.getTime() + CST_OFFSET_MS);
      const pad = (n: number) => String(n).padStart(2, '0');
      return {
        iso: now.toISOString(),
        date: `${cst.getUTCFullYear()}-${pad(cst.getUTCMonth() + 1)}-${pad(cst.getUTCDate())}`,
        time: `${pad(cst.getUTCHours())}:${pad(cst.getUTCMinutes())}:${pad(cst.getUTCSeconds())}`,
        weekday: `星期${WEEKDAYS[cst.getUTCDay()]}`,
        timezone: 'Asia/Shanghai',
      };
    },
  });
}
