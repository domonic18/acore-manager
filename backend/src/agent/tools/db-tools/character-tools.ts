import { z } from 'zod';
import { registerTool } from '@/agent/tools/registry';
import { runReadOnly } from './query-guard';

// 角色域白名单工具（需求 3.5）：全部经 runReadOnly 只读执行；
// 行数上限/截断由护栏统一处理，SQL 列表与本地库实际列核对（mail 时间列为 deliver_time/expire_time）。

type Row = Record<string, unknown>;

export function registerCharacterTools(): void {
  registerTool({
    name: 'get_character_overview',
    description: '按角色名（模糊）或 guid 查询角色概况：等级/种族/职业/金钱/在线/地图/公会/击杀数/延迟。',
    schema: z
      .object({
        name: z.string().min(2).optional().describe('角色名（模糊匹配）'),
        guid: z.number().int().positive().optional().describe('角色 guid（精确匹配）'),
      })
      .refine((v) => v.name !== undefined || v.guid !== undefined, { message: 'name 与 guid 至少提供一个' }),
    handler: async (args) => {
      const { name, guid } = args as { name?: string; guid?: number };
      return runReadOnly(
        'characters',
        `SELECT c.guid, c.name, c.account, c.race, c.class, c.gender, c.level, c.money, c.online, c.map, c.zone,
                c.totalKills, c.totaltime, c.leveltime, c.latency, g.name AS guild_name
         FROM characters c
         LEFT JOIN guild_member gm ON gm.guid = c.guid
         LEFT JOIN guild g ON g.guildid = gm.guildid
         WHERE ${guid !== undefined ? 'c.guid = ?' : 'c.name LIKE ?'}
         ORDER BY c.level DESC
         LIMIT 10`,
        [guid ?? `%${name}%`],
      );
    },
  });

  registerTool({
    name: 'get_character_auras',
    description: '查询角色当前身上的光环（spell ID/叠加层数/剩余秒数）。用于比对移动类光环误报（详见误报解释引擎）。',
    schema: z.object({ guid: z.number().int().positive().describe('角色 guid') }),
    handler: async (args) => {
      const { guid } = args as { guid: number };
      return runReadOnly('characters', 'SELECT spell, stackCount, remainTime FROM character_aura WHERE guid = ? LIMIT 50', [guid]);
    },
  });

  registerTool({
    name: 'get_character_associates',
    description: '查询角色社交关联：好友（friends，含对方名字/等级/在线）、所属小队（group）、公会信息（guild）。',
    schema: z.object({
      guid: z.number().int().positive().describe('角色 guid'),
      type: z.enum(['friends', 'group', 'guild', 'all']).default('all').describe('关联类型'),
    }),
    handler: async (args) => {
      const { guid, type } = args as { guid: number; type: 'friends' | 'group' | 'guild' | 'all' };
      const result: Record<string, unknown> = {};
      if (type === 'friends' || type === 'all') result.friends = await listFriends(guid);
      if (type === 'group' || type === 'all') {
        result.group = (
          await runReadOnly('characters', 'SELECT gm.guid AS leader_guid, gm.subgroup FROM group_member gm WHERE gm.memberGuid = ? LIMIT 10', [guid])
        ).rows;
      }
      if (type === 'guild' || type === 'all') {
        result.guild = (
          await runReadOnly(
            'characters',
            `SELECT g.guildid, g.name AS guild_name, g.leaderguid, g.motd, gm.rank
             FROM guild_member gm JOIN guild g ON g.guildid = gm.guildid
             WHERE gm.guid = ? LIMIT 1`,
            [guid],
          )
        ).rows;
      }
      return result;
    },
  });

  registerTool({
    name: 'get_money_flow',
    description:
      '查询角色金钱流水（log_money）：先按 guid 解析角色名，再返回 N 天内其作为付款方（sender_guid）或收款方的记录。注意：流水表无收款方 guid，收款记录仅能按角色名匹配。',
    schema: z.object({
      guid: z.number().int().positive().describe('角色 guid'),
      daysBack: z.number().int().min(1).max(90).default(7).describe('回溯天数'),
      role: z.enum(['sender', 'receiver', 'both']).default('both').describe('资金方向'),
    }),
    handler: async (args) => {
      const { guid, daysBack, role } = args as { guid: number; daysBack: number; role: 'sender' | 'receiver' | 'both' };
      const who = await runReadOnly('characters', 'SELECT name FROM characters WHERE guid = ? LIMIT 1', [guid]);
      const name = who.rows[0]?.name as string | undefined;
      if (!name) return { rows: [], truncated: false, note: `角色 guid=${guid} 不存在` };
      const bySender = role !== 'receiver';
      const byReceiver = role !== 'sender';
      const cond = bySender && byReceiver ? '(sender_guid = ? OR receiver_name = ?)' : bySender ? 'sender_guid = ?' : 'receiver_name = ?';
      return runReadOnly(
        'characters',
        `SELECT sender_guid, sender_name, sender_ip, receiver_acc, receiver_name, money, topic, date, type
         FROM log_money
         WHERE date >= DATE_SUB(NOW(), INTERVAL ? DAY) AND ${cond}
         ORDER BY date DESC
         LIMIT 50`,
        [daysBack, ...(bySender ? [guid] : []), ...(byReceiver ? [name] : [])],
      );
    },
  });

  registerTool({
    name: 'get_mail_transfers',
    description: '查询角色资金相关邮件：N 天内收发的附钱（money>0）或到付（cod>0）邮件，含派送/过期时间。',
    schema: z.object({
      guid: z.number().int().positive().describe('角色 guid'),
      daysBack: z.number().int().min(1).max(90).default(7).describe('回溯天数'),
    }),
    handler: async (args) => {
      const { guid, daysBack } = args as { guid: number; daysBack: number };
      return runReadOnly(
        'characters',
        `SELECT id, messageType, sender, receiver, subject, money, cod, has_items, deliver_time, expire_time
         FROM mail
         WHERE (sender = ? OR receiver = ?) AND deliver_time >= UNIX_TIMESTAMP(NOW() - INTERVAL ? DAY)
           AND (money > 0 OR cod > 0)
         ORDER BY deliver_time DESC
         LIMIT 50`,
        [guid, guid, daysBack],
      );
    },
  });

  registerTool({
    name: 'get_auction_activity',
    description: '查询角色的拍卖行记录（itemowner=卖家，buyguid=当前买家）。仅含进行中的拍卖；成交或过期的记录会被系统清除。',
    schema: z.object({ guid: z.number().int().positive().describe('角色 guid') }),
    handler: async (args) => {
      const { guid } = args as { guid: number };
      return runReadOnly(
        'characters',
        `SELECT id, houseid, itemguid, itemowner, buyoutprice, time, buyguid, lastbid, startbid, deposit
         FROM auctionhouse
         WHERE itemowner = ? OR buyguid = ?
         ORDER BY time ASC
         LIMIT 50`,
        [guid, guid],
      );
    },
  });
}

async function listFriends(guid: number): Promise<Row[]> {
  const { rows } = await runReadOnly('characters', 'SELECT friend, note FROM character_social WHERE guid = ? AND (flags & 1) = 1 LIMIT 50', [guid]);
  if (rows.length === 0) return [];
  const guids = rows.map((r) => r.friend as number);
  const placeholders = guids.map(() => '?').join(',');
  const names = await runReadOnly('characters', `SELECT guid, name, level, online FROM characters WHERE guid IN (${placeholders})`, guids);
  const byGuid = new Map(names.rows.map((r) => [r.guid, r]));
  return rows.map((r) => {
    const c = byGuid.get(r.friend) as Row | undefined;
    return { guid: r.friend, name: c?.name ?? null, level: c?.level ?? null, online: c?.online ?? null, note: r.note ?? null };
  });
}
