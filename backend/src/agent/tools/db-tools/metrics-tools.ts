import { z } from 'zod';
import { registerTool } from '@/agent/tools/registry';
import { runReadOnly } from './query-guard';

// 服务器指标快照工具（需求 3.5）：在线人数（characters 库）+ 各 realm 最近一次启动时长（uptime 在 auth 库）。

export function registerMetricsTools(): void {
  registerTool({
    name: 'get_metrics_snapshot',
    description: '服务器运行指标快照：当前在线角色数与各 realm 最近一次启动记录（启动 unix 秒/已运行秒数/峰值人数/版本号）。',
    schema: z.object({}),
    handler: async () => {
      const [online, uptimes] = await Promise.all([
        runReadOnly('characters', 'SELECT COUNT(*) AS online FROM characters WHERE online = 1', []),
        runReadOnly('auth', 'SELECT realmid, starttime, uptime, maxplayers, revision FROM uptime ORDER BY starttime DESC LIMIT 50', []),
      ]);
      const latest = new Map<number, Record<string, unknown>>();
      for (const row of uptimes.rows) {
        const realmid = row.realmid as number;
        if (!latest.has(realmid)) latest.set(realmid, row); // 已按 starttime 倒序 → 首见即最新
      }
      return { onlineCount: Number(online.rows[0]?.online ?? 0), realms: [...latest.values()] };
    },
  });
}
