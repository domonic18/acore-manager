// server.log / authserver.log 异常标记解析（2026-09 排查补齐，P1/P3）：
// AC 核心在 server.log 里输出大量 cheat/anomaly 标记（"Possible hacking attempt"、
// "HACK ALERT"、"CHEATER"、AntiDOS 洪水、authserver 撞库失败登录等），此前巡检只靠
// agent grep 自觉发现，报告不可见。本模块把这些已知语句做成代码级标记表：
// 分类 → 抽取 玩家/GUID/IP → 玩家×标记 聚合 + authserver 按 IP 聚合与爆破判定。
// 语句模板与 AC 源码逐一对照（SpellEffects/QuestHandler/WorldSession/AuthSession 等，
// 2026-09 源码版本）；生产实录校准：loot-respawn 在 09-27 出现 14 条（11 条为多开采集
// 抢节点刷新，3 条为普通玩家客户端状态残留）——单次不构成作弊证据，重复频次才是判据。

export interface AnomalyEvent {
  time: string;
  kind: string;
  severity: 'high' | 'medium';
  player: string | null;
  guid: number | null;
  ip: string | null;
  /** 标记专属补充信息（如 goEntry/questId/opcode），无则 null */
  detail: string | null;
  raw: string;
}

export interface AuthFailureEvent {
  time: string;
  ip: string;
  account: string;
}

interface MarkerDef {
  kind: string;
  severity: 'high' | 'medium';
  /** 稳定字面/正则，命中即分类 */
  re: RegExp;
  /** 从命中行抽取 玩家/GUID/IP/detail */
  extract: (line: string) => Pick<AnomalyEvent, 'player' | 'guid' | 'ip' | 'detail'>;
}

const TIME_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/;
// Player 名 + Player GUID 的三种源码形态：`Player NAME [GUID Full: ... Low: N]`、
// `Player NAME (GUID Full: ... Low: N)`、GetPlayerInfo() 的 `[Player: NAME GUID Full: ... Low: N, Account: N]`
const PLAYER_GUID_RE = /Player:? ([^\s[(]+) (?:\[|\()?GUID Full: 0x[0-9a-fA-F]+ Type: Player Low: (\d+)/;
const LOW_GUID_RE = /Low: (\d+)/;

const markers: MarkerDef[] = [
  {
    // SpellEffects.cpp:2038 —— 抢拾取已到刷新时间的 gameobject（FP 高发：节点竞速/多开采集/客户端状态残留）
    kind: 'loot-respawn',
    severity: 'medium',
    re: /tried to loot a gameobject \[.*?Entry: (\d+)\s+Low: \d+\] which is on respawn time/,
    extract: (l) => {
      const m = PLAYER_GUID_RE.exec(l);
      const go = /Entry: (\d+)\s+Low: \d+\] which is on respawn time/.exec(l);
      return { player: m?.[1] ?? null, guid: m ? Number(m[2]) : null, ip: null, detail: go ? `goEntry=${go[1]}` : null };
    },
  },
  {
    // SpellHandler.cpp:245
    kind: 'item-open-not-openable',
    severity: 'medium',
    re: /tried to open item \[.*?entry: \d+\] which is not openable/,
    extract: (l) => {
      const m = PLAYER_GUID_RE.exec(l);
      return { player: m?.[1] ?? null, guid: m ? Number(m[2]) : null, ip: null, detail: null };
    },
  },
  {
    // QuestHandler.cpp:277
    kind: 'quest-complete-no-right',
    severity: 'high',
    re: /HACK ALERT: Player .*? is trying to complete quest \(id: (\d+)\) but he has no right/,
    extract: (l) => {
      const m = PLAYER_GUID_RE.exec(l);
      const q = /complete quest \(id: (\d+)\)/.exec(l);
      return { player: m?.[1] ?? null, guid: m ? Number(m[2]) : null, ip: null, detail: q ? `quest=${q[1]}` : null };
    },
  },
  {
    // QuestHandler.cpp:507
    kind: 'quest-no-possession',
    severity: 'high',
    re: /tried to complete quest \[entry: (\d+)\] without being in possession/,
    extract: (l) => {
      const m = PLAYER_GUID_RE.exec(l);
      const q = /\[entry: (\d+)\]/.exec(l);
      return { player: m?.[1] ?? null, guid: m ? Number(m[2]) : null, ip: null, detail: q ? `quest=${q[1]}` : null };
    },
  },
  {
    // QuestHandler.cpp:257
    kind: 'quest-invalid-reward',
    severity: 'high',
    re: /tried to get invalid reward \((\d+)\) \(probably packet hacking\)/,
    extract: (l) => {
      const m = PLAYER_GUID_RE.exec(l);
      const q = /invalid reward \((\d+)\)/.exec(l);
      return { player: m?.[1] ?? null, guid: m ? Number(m[2]) : null, ip: null, detail: q ? `quest=${q[1]}` : null };
    },
  },
  {
    // AuctionHouseHandler.cpp:623（消息只有 GUID 无玩家名）
    kind: 'auction-cancel-foreign',
    severity: 'high',
    re: /CHEATER : .+?, he tried to cancel auction \(id: (\d+)\) of another player/,
    extract: (l) => {
      const g = LOW_GUID_RE.exec(l);
      const a = /cancel auction \(id: (\d+)\)/.exec(l);
      return { player: null, guid: g ? Number(g[1]) : null, ip: null, detail: a ? `auction=${a[1]}` : null };
    },
  },
  {
    // GuildHandler.cpp:38（GetPlayerInfo 形态）
    kind: 'guild-create-cheat',
    severity: 'high',
    re: /Possible hacking-attempt: \[Player: .*?\] tried to create a guild \[Name: .+?\] using cheats/,
    extract: (l) => {
      const m = PLAYER_GUID_RE.exec(l);
      const n = /guild \[Name: (.+?)\]/.exec(l);
      return { player: m?.[1] ?? null, guid: m ? Number(m[2]) : null, ip: null, detail: n ? `guild=${n[1]}` : null };
    },
  },
  {
    // ChatHandler.cpp:77（GetPlayerInfo 形态）
    kind: 'chat-universal-language',
    severity: 'medium',
    re: /tried to send a message in universal language/,
    extract: (l) => {
      const m = PLAYER_GUID_RE.exec(l);
      return { player: m?.[1] ?? null, guid: m ? Number(m[2]) : null, ip: null, detail: null };
    },
  },
  {
    // CharacterHandler.cpp:1645/1953 —— 账号外访问他人角色定制/转阵营（盗号指标）
    kind: 'foreign-account-access',
    severity: 'high',
    re: /Account (\d+), IP: ([0-9a-fA-F.:]+) tried to (customise|factionchange) (.*?), but it does not belong to their account/,
    extract: (l) => {
      const m = /Account (\d+), IP: ([0-9a-fA-F.:]+) tried to (customise|factionchange) (.*?), but it does not belong/.exec(l);
      return m ? { player: null, guid: null, ip: m[2], detail: `account=${m[1]} op=${m[3]}` } : { player: null, guid: null, ip: null, detail: null };
    },
  },
  {
    // Player.cpp:499-530 —— 客户端篡改创建非法角色
    kind: 'char-create-invalid',
    severity: 'medium',
    re: /Player::Create: Possible hacking-attempt: Account (\d+) tried creating a character named '(.+?)' with an invalid/,
    extract: (l) => {
      const m = /Account (\d+) tried creating a character named '(.+?)'/.exec(l);
      return m ? { player: m[2], guid: null, ip: null, detail: `account=${m[1]}` } : { player: null, guid: null, ip: null, detail: null };
    },
  },
  {
    // PlayerStorage.cpp:2128
    kind: 'token-currency-bag',
    severity: 'medium',
    re: /tried to move token \[.*?entry: \d+\] out of the currency bag/,
    extract: (l) => {
      const m = PLAYER_GUID_RE.exec(l);
      return { player: m?.[1] ?? null, guid: m ? Number(m[2]) : null, ip: null, detail: null };
    },
  },
  {
    // BattleGroundHandler.cpp:88
    kind: 'bg-invalid-type',
    severity: 'medium',
    re: /Battleground: invalid bgtype \((\d+)\) received\. possible cheater\? player/,
    extract: (l) => {
      const g = LOW_GUID_RE.exec(l);
      const b = /invalid bgtype \((\d+)\)/.exec(l);
      return { player: null, guid: g ? Number(g[1]) : null, ip: null, detail: b ? `bgType=${b[1]}` : null };
    },
  },
  {
    // Battleground.cpp:1873
    kind: 'bg-object-mismatch',
    severity: 'medium',
    re: /Battleground::GetObjectType: player used gameobject .*? which is not in internal data for BG/,
    extract: (l) => {
      const g = LOW_GUID_RE.exec(l);
      return { player: null, guid: g ? Number(g[1]) : null, ip: null, detail: null };
    },
  },
  {
    // MailHandler.cpp:44（WARN）
    kind: 'mailbox-cheat',
    severity: 'medium',
    re: /attempted to open mailbox by using a cheat/,
    extract: (l) => {
      const m = /(?:^|\s)(\S+) attempted to open mailbox by using a cheat/.exec(l);
      return { player: m?.[1] ?? null, guid: null, ip: null, detail: null };
    },
  },
  {
    // WorldSession.cpp:1385（WARN）—— 封包洪水（攻击/外挂驱动）
    kind: 'antidos-flood',
    severity: 'high',
    re: /AntiDOS: Account (\d+), IP: ([^,]+), Ping: (\d+), Character: ([^,]*), flooding packet \(opc: (.+?) \(0x[0-9A-Fa-f]+\), count: (\d+)\)/,
    extract: (l) => {
      const m = /AntiDOS: Account (\d+), IP: ([^,]+), Ping: (\d+), Character: ([^,]*), flooding packet \(opc: (.+?) \(0x[0-9A-Fa-f]+\), count: (\d+)\)/.exec(l);
      return m
        ? { player: m[4] || null, guid: null, ip: m[2], detail: `opc=${m[5]} count=${m[6]} ping=${m[3]}` }
        : { player: null, guid: null, ip: null, detail: null };
    },
  },
];

/** 逐行分类（未命中返回 null）。time 取日志行首 19 字符时间戳。 */
export function parseAnomalyLine(line: string): AnomalyEvent | null {
  const t = TIME_RE.exec(line);
  if (!t) return null;
  for (const def of markers) {
    if (!def.re.test(line)) continue;
    const { player, guid, ip, detail } = def.extract(line);
    return { time: t[1], kind: def.kind, severity: def.severity, player, guid, ip, detail, raw: line };
  }
  return null;
}

/** 快速预过滤：Server 日志 1.2M 行里绝大多数不含候选词，先于逐标记正则淘汰 */
export function isAnomalyCandidate(line: string): boolean {
  const low = line.toLowerCase();
  // "not belong"：customise/factionchange 越权行（盗号指标）不含 hack/cheat 字样，需单独命中
  return low.includes('hack') || low.includes('cheat') || low.includes('antidos') || low.includes('not belong');
}

export interface MarkerKindStat {
  kind: string;
  severity: 'high' | 'medium';
  count: number;
  firstTime: string;
  lastTime: string;
  /** 原始日志摘录 ≤2 条 */
  samples: string[];
}

export interface PlayerMarkerAggregate {
  /** guid 可用时为 `guid:N`，否则按玩家名聚合 */
  key: string;
  player: string | null;
  guid: number | null;
  total: number;
  worstSeverity: 'high' | 'medium';
  kinds: MarkerKindStat[];
}

export function aggregateMarkers(events: AnomalyEvent[], limit = 20): PlayerMarkerAggregate[] {
  const acc = new Map<string, { player: string | null; guid: number | null; total: number; kinds: Map<string, MarkerKindStat> }>();
  for (const e of events) {
    const key = e.guid !== null ? `guid:${e.guid}` : e.ip !== null ? `ip:${e.ip}` : `name:${e.player ?? 'unknown'}`;
    const entry = acc.get(key) ?? { player: e.player, guid: e.guid, total: 0, kinds: new Map<string, MarkerKindStat>() };
    entry.total++;
    if (entry.player === null && e.player !== null) entry.player = e.player;
    const stat = entry.kinds.get(e.kind) ?? {
      kind: e.kind,
      severity: e.severity,
      count: 0,
      firstTime: e.time,
      lastTime: e.time,
      samples: [],
    };
    stat.count++;
    if (e.time < stat.firstTime) stat.firstTime = e.time;
    if (e.time > stat.lastTime) stat.lastTime = e.time;
    if (stat.samples.length < 2) stat.samples.push(e.raw);
    entry.kinds.set(e.kind, stat);
    acc.set(key, entry);
  }
  return [...acc.entries()]
    .map(([key, entry]): PlayerMarkerAggregate => {
      const kinds = [...entry.kinds.values()].sort((a, b) => b.count - a.count);
      return {
        key,
        player: entry.player,
        guid: entry.guid,
        total: entry.total,
        worstSeverity: kinds.some((k) => k.severity === 'high') ? 'high' : 'medium',
        kinds,
      };
    })
    .sort((a, b) => b.total - a.total || (a.worstSeverity === 'high' ? -1 : 1))
    .slice(0, limit);
}

// ---- authserver 失败登录（server.authserver.hack，P3 爆破判定）----

const AUTH_FAIL_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*?'([0-9a-fA-F.:]+):\d+' \[AuthChallenge\] account (.+?) tried to login with invalid password!/;

export function parseAuthFailureLine(line: string): AuthFailureEvent | null {
  const m = AUTH_FAIL_RE.exec(line);
  return m ? { time: m[1], ip: m[2], account: m[3] } : null;
}

export interface AuthFailureAggregate {
  ip: string;
  count: number;
  distinctAccounts: number;
  accounts: { account: string; count: number }[];
  firstTime: string;
  lastTime: string;
  /** 当日 count≥10 或跨账号≥5 → 疑似撞库爆破 */
  bruteForceSuspect: boolean;
}

export function aggregateAuthFailures(events: AuthFailureEvent[], limit = 10): AuthFailureAggregate[] {
  const acc = new Map<string, { counts: Map<string, number>; first: string; last: string; count: number }>();
  for (const e of events) {
    const entry = acc.get(e.ip) ?? { counts: new Map<string, number>(), first: e.time, last: e.time, count: 0 };
    entry.count++;
    entry.counts.set(e.account, (entry.counts.get(e.account) ?? 0) + 1);
    if (e.time < entry.first) entry.first = e.time;
    if (e.time > entry.last) entry.last = e.time;
    acc.set(e.ip, entry);
  }
  return [...acc.entries()]
    .map(([ip, entry]) => {
      const accounts = [...entry.counts.entries()].map(([account, count]) => ({ account, count })).sort((a, b) => b.count - a.count);
      const distinct = accounts.length;
      return {
        ip,
        count: entry.count,
        distinctAccounts: distinct,
        accounts: accounts.slice(0, 10),
        firstTime: entry.first,
        lastTime: entry.last,
        bruteForceSuspect: entry.count >= 10 || distinct >= 5,
      };
    })
    .sort((a, b) => b.count - a.count || b.distinctAccounts - a.distinctAccounts)
    .slice(0, limit);
}
