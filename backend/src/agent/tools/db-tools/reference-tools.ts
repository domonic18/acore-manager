import { z } from 'zod';
import { registerTool } from '@/agent/tools/registry';
import { buildGameRefUrl, type GameRefLinkType } from './game-refs';
import { runReadOnly } from './query-guard';

// 游戏引用查询工具：任务/物品/GameObject/NPC ID → 名称与 nfuwow 详情页链接（world 库模板表，只读）。
// 名称来自服务端模板表（英文）——客户端中文名在本地化文件中，服务端无 locales_* 表；
// agent 引用时必须直接使用返回值，禁止自行翻译或编造名称（历史事故：报告臆造区域/任务名）。
// url 为 nfuwow 中文数据库页面，报告 markdown 中可直接作 [名称](url) 超链接引用。

const REF_SOURCES: Record<GameRefLinkType, { table: string; select: string; column: string }> = {
  quest: { table: 'quest_template', select: 'ID AS id, LogTitle AS name', column: 'ID' },
  item: { table: 'item_template', select: 'entry AS id, name', column: 'entry' },
  gameobject: { table: 'gameobject_template', select: 'entry AS id, name', column: 'entry' },
  npc: { table: 'creature_template', select: 'entry AS id, name', column: 'entry' },
};

export function registerReferenceTools(): void {
  registerTool({
    name: 'get_game_references',
    description:
      '批量查询任务/物品/GameObject/NPC 的名称与 nfuwow 数据库详情页链接（服务端英文模板名）。' +
      '报告引用这些 ID 时先查此工具；返回英文名直接引用，查不到的以纯 ID 表述，禁止自行翻译或编造名称。' +
      '返回的 url 是中文数据库页面（任务/物品有中文名），markdown 输出中可直接用作 [名称](url) 超链接。',
    schema: z.object({
      type: z.enum(['quest', 'item', 'gameobject', 'npc']).describe('引用类型'),
      ids: z
        .array(z.number().int().positive())
        .min(1)
        .max(30)
        .describe('ID 列表（单次最多 30 个）'),
    }),
    handler: async (args) => {
      const { type, ids } = args as { type: GameRefLinkType; ids: number[] };
      const unique = [...new Set(ids)];
      const { select, table, column } = REF_SOURCES[type];
      const ph = unique.map(() => '?').join(',');
      const result = await runReadOnly('world', `SELECT ${select} FROM ${table} WHERE ${column} IN (${ph})`, unique);
      const rows = result.rows.map((r) => ({ ...r, url: buildGameRefUrl(type, r.id as number) }));
      const found = new Set(result.rows.map((r) => r.id));
      return { rows, missing: unique.filter((id) => !found.has(id)) };
    },
  });
}
