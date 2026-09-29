// 反作弊日志代码级结构化解析（需求 3.5）：
// 行格式由 acore anticheat 模块固定（真实样例校准，中英文玩家名均支持）：
// 2026-08-20 16:44:19 INFO [anticheat.module] AnticheatMgr:: Speed-Hack (detail...) detected player 灭团之星
//   (GUID Full: 0x0000000000002c36 Type: Player Low: 11318) - Latency: 85 ms - IP: 192.168.65.1
//   - Cheat Flagged At: .go xyz -247.699890 1065.007812 55.583813 530 1.265799
// 模块真实输出中类型串写法不统一（"Speed-Hack" / "Walk on Water - Hack"），经 normalizeViolationType 归一化为
// 与 daily_players_reports 列、ai_anticheat_exemption.violation_type 一致的 canonical 键。
// 生产实测（2026-09  realms 日志）三处格式漂移需兼容：GUID 括号与后续字段间空格数不定
// （"Teleport To Plane" 类型恒为双空格）；"Ignore Zaxis Hack" 需归一化到 zaxis（此前落到
// fallback 键 ignorezaxis，导致豁免/光环/日报列全部失配）；Teleport-Hack 行在 IP 与
// Cheat Flagged At 之间带 "- GPS Diff X/Y/Z" 位移段（瞬移距离判据，缺失曾致该类行坐标全丢）。

export interface ParsedViolation {
  time: string;
  typeRaw: string;
  type: string;
  player: string;
  guid: number;
  latencyMs: number | null;
  ip: string | null;
  /** Teleport-Hack 行专有：GPS Diff 位移（水平距离即瞬移幅度，无该段时为 null） */
  gpsDiff: { dx: number; dy: number; dz: number } | null;
  mapId: number | null;
  /** Cheat Flagged At 坐标（无该段时为 null），用于聚合坐标集中度 */
  pos: { x: number; y: number; z: number } | null;
  /** speed 类型专有：超速幅度 % 与服务器允许速率（7=步行 14=史诗陆地坐骑 28=飞行级） */
  speedPctAbove: number | null;
  speedAllowedRate: number | null;
  detail: string;
  raw: string;
}

const LINE_RE =
  /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \w+ \[anticheat\.module\] AnticheatMgr:: (.+?) detected player (.+?) \(GUID Full: 0x[0-9a-fA-F]+ Type: Player Low: (\d+)\)\s*(?:- Latency: (\d+) ms)?(?:\s*- IP: ([0-9a-fA-F.:]+))?(?:\s*- GPS Diff X: (-?[\d.]+) Y: (-?[\d.]+) Z: (-?[\d.]+))?(?:\s*- Cheat Flagged At: \.go \S+ (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (\d+))?/;

const SPEED_RE = /Speed Movement at ([\d.]+)% above allowed Server Set rate ([\d.]+)%/;

const TYPE_ALIASES: [RegExp, string][] = [
  [/^speed/i, 'speed'],
  [/^fly/i, 'fly'],
  [/^jump/i, 'jump'],
  [/^climb/i, 'climb'],
  [/^walk\s*on\s*water/i, 'waterwalk'],
  [/^teleport\s*to\s*plane/i, 'teleportplane'],
  [/^teleport/i, 'teleport'],
  [/^ignore\s*control/i, 'ignorecontrol'],
  [/^ignore\s*z/i, 'zaxis'],
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
  const speed = SPEED_RE.exec(typeRaw);
  return {
    time,
    typeRaw: typeRaw.trim(),
    type: normalizeViolationType(typeRaw),
    player,
    guid: Number(guid),
    latencyMs: latency ? Number(latency) : null,
    ip: ip ?? null,
    gpsDiff: m[7] ? { dx: Number(m[7]), dy: Number(m[8]), dz: Number(m[9]) } : null,
    mapId: m[13] ? Number(m[13]) : null,
    pos: m[10] ? { x: Number(m[10]), y: Number(m[11]), z: Number(m[12]) } : null,
    speedPctAbove: speed ? Number(speed[1]) : null,
    speedAllowedRate: speed ? Number(speed[2]) : null,
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
