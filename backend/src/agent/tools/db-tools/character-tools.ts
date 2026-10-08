import { z } from 'zod';
import { registerTool } from '@/agent/tools/registry';
import { matchAuraSpells } from '@/agent/tools/false-positive/aura-rules';
import { mapName } from '@/agent/tools/log-tools/map-names';
import { zoneName } from '@/agent/tools/log-tools/zone-names';
import { achievementName } from './achievement-names';
import { className, formatGold, raceName } from './game-names';
import { runReadOnly } from './query-guard';

// 角色域白名单工具（需求 3.5）：全部经 runReadOnly 只读执行；
// 行数上限/截断由护栏统一处理，SQL 列表与本地库实际列核对（mail 时间列为 deliver_time/expire_time）。
// 输出富化：race/class/map/zone 原始 ID 旁附 raceName/className/mapName/zoneName 中文名，
// 金钱字段附 *Text 格式化金额（X金X银X铜）——名称必须取自工具返回，禁止模型按 ID 臆测。

type Row = Record<string, unknown>;

function enrichOverview(r: Row): Row {
  return {
    ...r,
    raceName: raceName(r.race as number | null),
    className: className(r.class as number | null),
    mapName: r.map != null ? mapName(r.map as number) : null,
    zoneName: zoneName(r.zone as number | null),
    moneyText: formatGold(r.money as number | null),
  };
}

function enrichMoney(r: Row, fields: readonly string[]): Row {
  return { ...r, ...Object.fromEntries(fields.map((f) => [`${f}Text`, formatGold(r[f] as number | null)])) };
}

// character_achievement.date 为 Unix 秒；成就时间面向玩家行为画像，固定按北京时间呈现
const CST_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function achievementDateText(epochSeconds: unknown): string | null {
  if (typeof epochSeconds !== 'number' || !Number.isFinite(epochSeconds)) return null;
  return CST_FORMATTER.format(new Date(epochSeconds * 1000)).replace(/\//g, '-');
}

export function registerCharacterTools(): void {
  registerTool({
    name: 'get_character_overview',
    description:
      '按角色名（模糊）或 guid 查询角色概况：等级/种族/职业/金钱/在线/地图/公会/击杀数/延迟。raceName/className/mapName/zoneName 为中文名，moneyText 为格式化金额，报告必须直接引用这些名称字段。',
    schema: z
      .object({
        name: z.string().min(2).optional().describe('角色名（模糊匹配）'),
        guid: z.number().int().positive().optional().describe('角色 guid（精确匹配）'),
      })
      .refine((v) => v.name !== undefined || v.guid !== undefined, { message: 'name 与 guid 至少提供一个' }),
    handler: async (args) => {
      const { name, guid } = args as { name?: string; guid?: number };
      const result = await runReadOnly(
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
      return { ...result, rows: result.rows.map(enrichOverview) };
    },
  });

  registerTool({
    name: 'get_character_auras',
    description: '查询角色当前身上的光环（spell ID/叠加层数/剩余秒数），命中的移动类规则附 movementHint。',
    schema: z.object({ guid: z.number().int().positive().describe('角色 guid') }),
    handler: async (args) => {
      const { guid } = args as { guid: number };
      const result = await runReadOnly('characters', 'SELECT spell, stackCount, remainTime FROM character_aura WHERE guid = ? LIMIT 50', [guid]);
      const matched = matchAuraSpells(result.rows.map((r) => r.spell as number));
      const spellToLabel = new Map<string, string>();
      for (const m of matched) for (const s of m.spells) spellToLabel.set(String(s), m.label);
      const rows = result.rows.map((r) => {
        const label = spellToLabel.get(String(r.spell));
        return label ? { ...r, movementHint: label } : r;
      });
      return { rows, truncated: result.truncated, movementRules: matched };
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
      '查询角色金钱流水（log_money）：先按 guid 解析角色名，再返回 N 天内其作为付款方（sender_guid）或收款方的记录，moneyText 为格式化金额。注意：流水表无收款方 guid，收款记录仅能按角色名匹配。',
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
      const result = await runReadOnly(
        'characters',
        `SELECT sender_guid, sender_name, sender_ip, receiver_acc, receiver_name, money, topic, date, type
         FROM log_money
         WHERE date >= DATE_SUB(NOW(), INTERVAL ? DAY) AND ${cond}
         ORDER BY date DESC
         LIMIT 50`,
        [daysBack, ...(bySender ? [guid] : []), ...(byReceiver ? [name] : [])],
      );
      return { ...result, rows: result.rows.map((r) => enrichMoney(r, ['money'])) };
    },
  });

  registerTool({
    name: 'get_mail_transfers',
    description: '查询角色资金相关邮件：N 天内收发的附钱（money>0）或到付（cod>0）邮件，含派送/过期时间；moneyText/codText 为格式化金额。',
    schema: z.object({
      guid: z.number().int().positive().describe('角色 guid'),
      daysBack: z.number().int().min(1).max(90).default(7).describe('回溯天数'),
    }),
    handler: async (args) => {
      const { guid, daysBack } = args as { guid: number; daysBack: number };
      const result = await runReadOnly(
        'characters',
        `SELECT id, messageType, sender, receiver, subject, money, cod, has_items, deliver_time, expire_time
         FROM mail
         WHERE (sender = ? OR receiver = ?) AND deliver_time >= UNIX_TIMESTAMP(NOW() - INTERVAL ? DAY)
           AND (money > 0 OR cod > 0)
         ORDER BY deliver_time DESC
         LIMIT 50`,
        [guid, guid, daysBack],
      );
      return { ...result, rows: result.rows.map((r) => enrichMoney(r, ['money', 'cod'])) };
    },
  });

  registerTool({
    name: 'get_auction_activity',
    description: '查询角色的拍卖行记录（itemowner=卖家，buyguid=当前买家），各价格字段附 *Text 格式化金额。仅含进行中的拍卖；成交或过期的记录会被系统清除。',
    schema: z.object({ guid: z.number().int().positive().describe('角色 guid') }),
    handler: async (args) => {
      const { guid } = args as { guid: number };
      const result = await runReadOnly(
        'characters',
        `SELECT id, houseid, itemguid, itemowner, buyoutprice, time, buyguid, lastbid, startbid, deposit
         FROM auctionhouse
         WHERE itemowner = ? OR buyguid = ?
         ORDER BY time ASC
         LIMIT 50`,
        [guid, guid],
      );
      return {
        ...result,
        rows: result.rows.map((r) => enrichMoney(r, ['buyoutprice', 'lastbid', 'startbid', 'deposit'])),
      };
    },
  });

  registerTool({
    name: 'get_character_quests',
    description:
      '查询角色任务足迹（巡查佐证：任务传送是否对应真实任务线、带刷痕迹）：inProgress 进行中任务（含目标进度）、' +
      'rewarded 已完成任务总量与采样（该表无时间戳，仅证明做过，不能证明完成时间）、recentActivity 近 N 天任务时间线' +
      '（quest_tracker，服务器未开启 QuestTracker 时恒为空）。name 为任务名（world 库 LogTitle），报告必须引用，查不到以「任务 {id}」表述。',
    schema: z.object({
      guid: z.number().int().positive().describe('角色 guid'),
      days: z.number().int().min(1).max(31).default(7).describe('时间线回溯天数'),
    }),
    handler: async (args) => {
      const { guid, days } = args as { guid: number; days: number };
      const inProgress = await runReadOnly(
        'characters',
        `SELECT quest, status, explored, timer, mobcount1, mobcount2, mobcount3, mobcount4,
                itemcount1, itemcount2, itemcount3, itemcount4, itemcount5, itemcount6
         FROM character_queststatus WHERE guid = ? LIMIT 50`,
        [guid],
      );
      const countRows = await runReadOnly(
        'characters',
        'SELECT COUNT(*) AS total FROM character_queststatus_rewarded WHERE guid = ? AND active = 1',
        [guid],
      );
      const total = Number(countRows.rows[0]?.total ?? 0);
      const rewarded = await runReadOnly(
        'characters',
        'SELECT quest FROM character_queststatus_rewarded WHERE guid = ? AND active = 1 ORDER BY quest LIMIT 50',
        [guid],
      );
      const recent = await runReadOnly(
        'characters',
        `SELECT id, quest_accept_time, quest_complete_time, quest_abandon_time, completed_by_gm
         FROM quest_tracker
         WHERE character_guid = ?
           AND COALESCE(quest_complete_time, quest_accept_time, quest_abandon_time) >= DATE_SUB(NOW(), INTERVAL ? DAY)
         ORDER BY COALESCE(quest_complete_time, quest_accept_time, quest_abandon_time) DESC
         LIMIT 20`,
        [guid, days],
      );

      const ids = new Set<number>();
      for (const r of [...inProgress.rows, ...rewarded.rows]) ids.add(r.quest as number);
      for (const r of recent.rows) ids.add(r.id as number);
      const names = new Map<number, string | null>();
      if (ids.size > 0) {
        const list = [...ids].slice(0, 120);
        const ph = list.map(() => '?').join(',');
        const named = await runReadOnly('world', `SELECT ID, LogTitle FROM quest_template WHERE ID IN (${ph})`, list);
        for (const r of named.rows) names.set(r.ID as number, (r.LogTitle as string) || null);
      }
      const questName = (id: number): string | null => names.get(id) ?? null;

      return {
        inProgress: {
          rows: inProgress.rows.map((r) => ({ ...r, name: questName(r.quest as number) })),
          truncated: inProgress.truncated,
        },
        rewarded: {
          total,
          sampled: rewarded.rows.map((r) => ({ quest: r.quest, name: questName(r.quest as number) })),
          truncated: total > rewarded.rows.length,
          note: '已完成任务表无时间戳：仅证明做过该任务，不能证明完成时间',
        },
        recentActivity: {
          rows: recent.rows.map((r) => ({ ...r, name: questName(r.id as number) })),
          ...(recent.rows.length === 0 && {
            note: `近 ${days} 天无 quest_tracker 记录（服务器未开启 QuestTracker 时该表恒为空，任务时间线不可用）`,
          }),
        },
      };
    },
  });

  registerTool({
    name: 'get_character_achievements',
    description:
      '查询角色最近达成的成就（按达成时间倒序）：name 为成就中文名（DBC 静态字典），dateText 为北京时间' +
      '（YYYY-MM-DD HH:mm）。成就是行为画像佐证（升级类成就跨度、探索/任务成就与任务足迹对照）。',
    schema: z.object({
      guid: z.number().int().positive().describe('角色 guid'),
      limit: z.number().int().min(1).max(50).default(10).describe('返回条数上限'),
    }),
    handler: async (args) => {
      const { guid, limit } = args as { guid: number; limit: number };
      const result = await runReadOnly(
        'characters',
        `SELECT achievement, date FROM character_achievement WHERE guid = ? ORDER BY date DESC LIMIT ${limit}`,
        [guid],
      );
      return {
        rows: result.rows.map((r) => ({
          ...r,
          name: achievementName(r.achievement as number),
          dateText: achievementDateText(r.date as number),
        })),
        truncated: result.truncated,
      };
    },
  });

  registerTool({
    name: 'get_character_social',
    description:
      '按 flags 全量分组查询角色社交名单：friends（0x01）/ignores 黑名单（0x02）/muted 禁言（0x04），各附对方名字/等级/在线。' +
      '与 get_character_associates 互补：后者覆盖好友/小队/公会，本工具覆盖黑名单与禁言维度（骚扰/工作室互证）。',
    schema: z.object({ guid: z.number().int().positive().describe('角色 guid') }),
    handler: async (args) => {
      const { guid } = args as { guid: number };
      const { rows, truncated } = await runReadOnly(
        'characters',
        'SELECT friend, flags, note FROM character_social WHERE guid = ? LIMIT 50',
        [guid],
      );
      const guids = [...new Set(rows.map((r) => r.friend as number))];
      const byGuid = new Map<number, Row>();
      if (guids.length > 0) {
        const ph = guids.map(() => '?').join(',');
        const named = await runReadOnly(
          'characters',
          `SELECT guid, name, level, online FROM characters WHERE guid IN (${ph})`,
          guids,
        );
        for (const r of named.rows) byGuid.set(r.guid as number, r);
      }
      const bucket = (flag: number): Row[] =>
        rows
          .filter((r) => ((r.flags as number) & flag) === flag)
          .map((r) => {
            const c = byGuid.get(r.friend as number);
            return { guid: r.friend, name: c?.name ?? null, level: c?.level ?? null, online: c?.online ?? null, note: r.note ?? null };
          });
      return { friends: bucket(0x01), ignores: bucket(0x02), muted: bucket(0x04), truncated };
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
