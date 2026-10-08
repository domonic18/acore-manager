import { env } from '@/config/env';

// 游戏词条链接（nfuwow 中文数据库，aowow 架构）：URL 确定性拼接，零网络依赖。
// 与前端 VITE_AOWOW_BASE_URL 同值对应（docker-compose 双端注入），db-tools 工具输出
// 与 report-tools 全文渲染共用本模块。

const LINK_PATHS = {
  quest: 'quest',
  item: 'item',
  gameobject: 'object',
  npc: 'npc',
  achievement: 'achievement',
} as const;

export type GameRefLinkType = keyof typeof LINK_PATHS;

export function buildGameRefUrl(type: GameRefLinkType, id: number): string {
  return `${env.AOWOW_BASE_URL}?${LINK_PATHS[type]}=${id}`;
}

// 报告文本链接化：仅"前缀+ID"形如「任务 9312 / 物品 17 / 节点 181683 / GameObject 181683 / NPC 123 / 成就 456」
// 命中（前缀后必须紧跟数字，"节点竞速/任务越权"等标记词不误伤）；先按已有 markdown 链接
// [文本](url) 分段、只处理非链接段，防止对模型已写链接的二次嵌套。
const REF_PATTERN = /(任务|物品|节点|GameObject|NPC|成就)\s*#?(\d{1,7})(?!\d)/g;
const MD_LINK_SEGMENT = /(\[[^\]]*\]\([^)]*\))/g;

function prefixToType(prefix: string): GameRefLinkType {
  switch (prefix) {
    case '任务':
      return 'quest';
    case '物品':
      return 'item';
    case 'NPC':
      return 'npc';
    case '成就':
      return 'achievement';
    default:
      return 'gameobject';
  }
}

export function linkifyGameRefs(text: string): string {
  return text
    .split(MD_LINK_SEGMENT)
    .map((seg) =>
      seg.startsWith('[') && seg.endsWith(')')
        ? seg
        : seg.replace(REF_PATTERN, (raw, prefix: string, id: string) => `[${raw}](${buildGameRefUrl(prefixToType(prefix), Number(id))})`),
    )
    .join('');
}
