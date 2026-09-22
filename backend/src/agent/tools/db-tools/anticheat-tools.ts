import { z } from 'zod';
import { acmDataSource } from '@/config/database';
import { AiAnticheatExemption } from '@/entities/acm/ai-anticheat-exemption.entity';
import { registerTool } from '@/agent/tools/registry';
import { runReadOnly } from './query-guard';

// 反作弊域白名单工具（需求 3.5）：角色库举报聚合 + acm 库 GM 豁免标注一次返回；
// 报告列与库表白名单一致（14 类违规 + counter_measures + total/average），禁用 SELECT *。

const REPORT_COLUMNS = `guid, creation_time, average, total_reports, speed_reports, fly_reports, jump_reports,
  waterwalk_reports, teleportplane_reports, climb_reports, teleport_reports, ignorecontrol_reports,
  zaxis_reports, antiswim_reports, gravity_reports, antiknockback_reports, no_fall_damage_reports,
  op_ack_hack_reports, counter_measures_reports`;

export function registerAnticheatTools(): void {
  registerTool({
    name: 'get_anticheat_record',
    description:
      '查询角色反作弊举报档案：当前聚合状态（players_reports_status）、N 天内逐日举报明细（daily_players_reports，creation_time 为 unix 秒）与 GM 豁免标注。average 为所有举报者举报时的均速均值。',
    schema: z.object({
      guid: z.number().int().positive().describe('角色 guid'),
      daysBack: z.number().int().min(1).max(90).default(7).describe('明细回溯天数'),
    }),
    handler: async (args) => {
      const { guid, daysBack } = args as { guid: number; daysBack: number };
      const [who, status, daily, exemptions] = await Promise.all([
        runReadOnly('characters', 'SELECT name, level, online FROM characters WHERE guid = ? LIMIT 1', [guid]),
        runReadOnly('characters', `SELECT ${REPORT_COLUMNS} FROM players_reports_status WHERE guid = ? LIMIT 1`, [guid]),
        runReadOnly(
          'characters',
          `SELECT ${REPORT_COLUMNS} FROM daily_players_reports
           WHERE guid = ? AND creation_time >= UNIX_TIMESTAMP(NOW() - INTERVAL ? DAY)
           ORDER BY creation_time DESC LIMIT 50`,
          [guid, daysBack],
        ),
        acmDataSource.getRepository(AiAnticheatExemption).find({ where: { characterGuid: guid } }),
      ]);
      return {
        character: who.rows[0] ?? null,
        status: status.rows[0] ?? null,
        daily: { rows: daily.rows, truncated: daily.truncated },
        exemptions: exemptions.map((e) => ({
          violationType: e.violationType,
          mapId: e.mapId,
          reason: e.reason,
          createdBy: e.createdBy,
          createdAt: e.createdAt,
        })),
      };
    },
  });
}
