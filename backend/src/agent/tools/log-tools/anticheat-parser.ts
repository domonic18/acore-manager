// 反作弊日志代码级结构化解析（需求 3.5）：
// 行格式由 acore anticheat 模块固定（真实样例校准，中英文玩家名均支持）：
// 2026-08-20 16:44:19 INFO [anticheat.module] AnticheatMgr:: Speed-Hack (detail...) detected player 灭团之星
//   (GUID Full: 0x0000000000002c36 Type: Player Low: 11318) - Latency: 85 ms - IP: 192.168.65.1
//   - Cheat Flagged At: .go xyz -247.699890 1065.007812 55.583813 530 1.265799
// 模块真实输出中类型串写法不统一（"Speed-Hack" / "Walk on Water - Hack"），经 normalizeViolationType 归一化为
// 与 daily_players_reports 列、ai_anticheat_exemption.violation_type 一致的 canonical 键。

export interface ParsedViolation {
  time: string;
  typeRaw: string;
  type: string;
  player: string;
  guid: number;
  latencyMs: number | null;
  ip: string | null;
  mapId: number | null;
  detail: string;
  raw: string;
}

const LINE_RE =
  /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \w+ \[anticheat\.module\] AnticheatMgr:: (.+?) detected player (.+?) \(GUID Full: 0x[0-9a-fA-F]+ Type: Player Low: (\d+)\)(?: - Latency: (\d+) ms)?(?: - IP: ([0-9a-fA-F.:]+))?(?: - Cheat Flagged At: \.go \S+ (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (\d+))?/;

const TYPE_ALIASES: [RegExp, string][] = [
  [/^speed/i, 'speed'],
  [/^fly/i, 'fly'],
  [/^jump/i, 'jump'],
  [/^climb/i, 'climb'],
  [/^walk\s*on\s*water/i, 'waterwalk'],
  [/^teleport\s*to\s*plane/i, 'teleportplane'],
  [/^teleport/i, 'teleport'],
  [/^ignore\s*control/i, 'ignorecontrol'],
  [/^z\s*axis/i, 'zaxis'],
  [/^anti\s*swim/i, 'antiswim'],
  [/^gravity/i, 'gravity'],
  [/^anti\s*knock/i, 'antiknockback'],
  [/^no\s*fall/i, 'nofalldamage'],
  [/^op\s*ack/i, 'opackhack'],
];

// 与 daily_players_reports 14 类违规列、ai_anticheat_exemption.violation_type 一致的完整枚举
// （豁免路由校验 / 误报引擎 explainTypes 共用此唯一出处）
export const VIOLATION_TYPES = [
  'speed',
  'fly',
  'jump',
  'waterwalk',
  'teleportplane',
  'climb',
  'teleport',
  'ignorecontrol',
  'zaxis',
  'antiswim',
  'gravity',
  'antiknockback',
  'nofalldamage',
  'opackhack',
] as const;
export type ViolationType = (typeof VIOLATION_TYPES)[number];

export function normalizeViolationType(raw: string): string {
  const stripped = raw.replace(/[\s-]*hack\s*$/i, '').trim();
  for (const [re, canonical] of TYPE_ALIASES) {
    if (re.test(stripped)) return canonical;
  }
  return stripped.toLowerCase().replace(/[\s-]+/g, '') || 'unknown';
}

export function parseAnticheatLine(line: string): ParsedViolation | null {
  const m = LINE_RE.exec(line);
  if (!m) return null;
  const [, time, typeRaw, player, guid, latency, ip] = m;
  return {
    time,
    typeRaw: typeRaw.trim(),
    type: normalizeViolationType(typeRaw),
    player,
    guid: Number(guid),
    latencyMs: latency ? Number(latency) : null,
    ip: ip ?? null,
    mapId: m[10] ? Number(m[10]) : null,
    detail: typeRaw.trim(),
    raw: line,
  };
}

export function parseAnticheatLog(text: string): ParsedViolation[] {
  const out: ParsedViolation[] = [];
  for (const line of text.split('\n')) {
    const parsed = parseAnticheatLine(line);
    if (parsed) out.push(parsed);
  }
  return out;
}
