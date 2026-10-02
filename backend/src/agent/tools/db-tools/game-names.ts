// 种族/职业 ID → 中文名静态表 + 铜币格式化：巡检/深度分析 agent 工具输出富化用。
// 与前端 frontend/src/shared/constants/game.constants.ts（raceMap/classMap）、
// frontend/src/shared/utils/gold.util.ts（formatGold）逐字同语义，两处修改需同步。
// 工具必须返回名称字段，禁止模型按数字 ID 自行翻译（历史事故：3525 被写成"泰罗卡森林"）。

export const RACE_NAMES: Record<number, string> = {
  1: '人类',
  2: '兽人',
  3: '矮人',
  4: '暗夜精灵',
  5: '亡灵',
  6: '牛头人',
  7: '侏儒',
  8: '巨魔',
  9: '地精',
  10: '血精灵',
  11: '德莱尼',
  22: '狼人',
};

export const CLASS_NAMES: Record<number, string> = {
  1: '战士',
  2: '圣骑士',
  3: '猎人',
  4: '潜行者',
  5: '牧师',
  6: '死亡骑士',
  7: '萨满',
  8: '法师',
  9: '术士',
  11: '德鲁伊',
};

export function raceName(id: number | null | undefined): string | null {
  if (id == null) return null;
  return RACE_NAMES[id] ?? `种族${id}`;
}

export function className(id: number | null | undefined): string | null {
  if (id == null) return null;
  return CLASS_NAMES[id] ?? `职业${id}`;
}

export function formatGold(copper: number | null | undefined): string | null {
  if (copper == null) return null;
  const gold = Math.floor(copper / 10000);
  const silver = Math.floor((copper % 10000) / 100);
  const remainingCopper = copper % 100;
  return `${gold}金${silver}银${remainingCopper}铜`;
}
