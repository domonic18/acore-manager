// 移动类光环规则（arch 3.5.1）：合法移动能力 → 可解释的违规类型。
// spell ID 为 WotLK 通用值；本地 spell_dbc 为精简构建（4498 行，基础技能缺失）无法库内校准，
// 坐骑移速附魔 / PvP 徽章族待 Owner T0.5 调研回填（见文末待校准注）。

export interface MovementAuraRule {
  label: string;
  spells: number[];
  explainsTypes: string[];
}

export const MOVEMENT_AURA_RULES: MovementAuraRule[] = [
  // 水上行走：牧师 Water Walking / 死骑 Path of Frost
  { label: '水上行走类光环', spells: [546, 3714], explainsTypes: ['waterwalk'] },
  // 水栖形态（鱼人游速，贴水面移动可误判水上行走）
  { label: '水栖形态', spells: [782], explainsTypes: ['waterwalk'] },
  // 飞行形态：空中移动可误判 fly / 跳跃离地 / 重力异常
  { label: '飞行形态', spells: [33943, 40120], explainsTypes: ['fly', 'jump', 'gravity'] },
  // 缓落/漂浮/降落伞：无摔落伤害与 Z 轴异常的合法来源
  { label: '缓落漂浮类', spells: [130, 1706, 45514], explainsTypes: ['nofalldamage', 'jump', 'zaxis', 'gravity'] },
  // 控制解除：_every man for himself / 亡灵意志（受控瞬移类误报）
  { label: '控制解除技能', spells: [59752, 7744], explainsTypes: ['ignorecontrol', 'teleport'] },
];

export function rulesForType(type: string): MovementAuraRule[] {
  return MOVEMENT_AURA_RULES.filter((r) => r.explainsTypes.includes(type));
}

/** 给定角色身上光环 spell 集合，返回命中的规则（用于 get_anticheat_record 标注） */
export function matchAuraSpells(spells: number[]): { label: string; spells: number[]; explainsTypes: string[] }[] {
  const set = new Set(spells);
  return MOVEMENT_AURA_RULES.filter((r) => r.spells.some((s) => set.has(s))).map((r) => ({
    label: r.label,
    spells: r.spells.filter((s) => set.has(s)),
    explainsTypes: r.explainsTypes,
  }));
}

// 待校准（Owner T0.5 调研回填）：
// - 坐骑移速加成附魔/道具（Riding Crop、Carrot on a Stick、Mithril Spurs 等）→ speed
// - PvP 饰品解除移动限制族（42292 一族触发技能）→ ignorecontrol
