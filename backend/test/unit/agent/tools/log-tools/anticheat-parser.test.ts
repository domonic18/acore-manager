import { normalizeViolationType, parseAnticheatLine } from '@/agent/tools/log-tools/anticheat-parser';

// 样例行取自本地测试服真实日志（anticheat 模块固定格式，中英文玩家名均出现）
const SPEED_LINE =
  '2026-08-20 16:44:19 INFO [anticheat.module] AnticheatMgr:: Speed-Hack (Speed Movement at 26.598583% above allowed Server Set rate 14%.) detected player 灭团之星 (GUID Full: 0x0000000000002c36 Type: Player Low: 11318) - Latency: 85 ms - IP: 192.168.65.1 - Cheat Flagged At: .go xyz -247.699890 1065.007812 55.583813 530 1.265799';
const WATERWALK_LINE =
  '2026-08-21 09:00:01 WARNING [anticheat.module] AnticheatMgr:: Walk on Water - Hack detected player Unparalleled (GUID Full: 0x0000000000000a1b Type: Player Low: 2587) - Latency: 230 ms - IP: 1.2.3.4';
// 以下两行取自生产环境 2026-09-27 真实日志（realm2）：
// "Ignore Zaxis Hack" 需归一化为 zaxis；"Teleport To Plane" 类型 GUID 括号后为双空格
const IGNORE_ZAXIS_LINE =
  '2026-09-27 00:32:40 INFO [anticheat.module] AnticheatMgr:: Ignore Zaxis Hack detected player 玄策 (GUID Full: 0x00000000000030d2 Type: Player Low: 12498) - Latency: 31 ms - IP: 117.173.233.224 - Cheat Flagged At: .go xyz 2897.955078 3227.378418 178.918793 530 6.045329';
const TELEPORT_PLANE_LINE =
  '2026-09-27 00:05:57 INFO [anticheat.module] AnticheatMgr:: Teleport To Plane - Hack detected player 后腿 (GUID Full: 0x000000000000266f Type: Player Low: 9839)  - Latency: 57 ms - IP: 112.43.5.119 - Cheat Flagged At: .go xyz 2449.711914 2855.792480 145.500931 530 4.438909';
// Teleport-Hack 行在 IP 与 Cheat Flagged At 之间带 GPS Diff 位移段（此前该段导致坐标全丢）
const TELEPORT_GPS_LINE =
  '2026-09-27 03:21:09 INFO [anticheat.module] AnticheatMgr:: Teleport-Hack detected player 萨小六 (GUID Full: 0x00000000000032dc Type: Player Low: 13028) - Latency: 12 ms - IP: 120.245.118.80 - GPS Diff X: 323.271 Y: 459.4375 Z: 68.95222 - Cheat Flagged At: .go xyz 3065.000000 5426.419922 149.389999 530 0.137277';

describe('anticheat-parser', () => {
  it('parses a full Speed-Hack line including coords and Chinese player name', () => {
    const v = parseAnticheatLine(SPEED_LINE);
    expect(v).not.toBeNull();
    expect(v).toMatchObject({
      time: '2026-08-20 16:44:19',
      type: 'speed',
      player: '灭团之星',
      guid: 11318,
      latencyMs: 85,
      ip: '192.168.65.1',
      mapId: 530,
    });
  });

  it('returns null for non-matching lines', () => {
    expect(parseAnticheatLine('2026-08-20 16:44:19 some unrelated log line')).toBeNull();
    expect(parseAnticheatLine('')).toBeNull();
  });

  it('normalizes real module type spellings to canonical keys', () => {
    expect(normalizeViolationType('Speed-Hack')).toBe('speed');
    expect(normalizeViolationType('Walk on Water - Hack')).toBe('waterwalk');
    expect(normalizeViolationType('Teleport To Plane - Hack')).toBe('teleportplane');
    expect(normalizeViolationType('Teleport-Hack')).toBe('teleport');
    expect(normalizeViolationType('Ignore Control - Hack')).toBe('ignorecontrol');
    expect(normalizeViolationType('Fly-Hack')).toBe('fly');
    expect(normalizeViolationType('Climb-Hack')).toBe('climb');
    expect(normalizeViolationType('Some New - Hack')).toBe('somenew');
  });

  it('still parses lines without latency/ip/coords segments', () => {
    const bare = '2026-08-21 09:00:01 INFO [anticheat.module] AnticheatMgr:: Fly-Hack detected player Unparalleled (GUID Full: 0x1 Type: Player Low: 2587)';
    const v = parseAnticheatLine(bare);
    expect(v).toMatchObject({ type: 'fly', guid: 2587, latencyMs: null, ip: null, mapId: null });
  });

  it('parses waterwalk line with latency', () => {
    const v = parseAnticheatLine(WATERWALK_LINE);
    expect(v).toMatchObject({ type: 'waterwalk', player: 'Unparalleled', guid: 2587, latencyMs: 230, mapId: null });
  });

  it('normalizes "Ignore Zaxis Hack" to zaxis (production alias, was falling back to ignorezaxis)', () => {
    expect(normalizeViolationType('Ignore Zaxis Hack')).toBe('zaxis');
    const v = parseAnticheatLine(IGNORE_ZAXIS_LINE);
    expect(v).toMatchObject({
      type: 'zaxis',
      player: '玄策',
      guid: 12498,
      latencyMs: 31,
      mapId: 530,
      pos: { x: 2897.955078, y: 3227.378418, z: 178.918793 },
    });
  });

  it('parses double-space "Teleport To Plane" production lines without losing latency/ip/coords', () => {
    const v = parseAnticheatLine(TELEPORT_PLANE_LINE);
    expect(v).toMatchObject({
      type: 'teleportplane',
      player: '后腿',
      guid: 9839,
      latencyMs: 57,
      ip: '112.43.5.119',
      mapId: 530,
    });
  });

  it('extracts structured speed magnitude and allowed rate', () => {
    const v = parseAnticheatLine(SPEED_LINE);
    expect(v).toMatchObject({ speedPctAbove: 26.598583, speedAllowedRate: 14 });
    expect(parseAnticheatLine(WATERWALK_LINE)).toMatchObject({ speedPctAbove: null, speedAllowedRate: null });
  });

  it('parses GPS Diff segment on Teleport-Hack lines without losing coords', () => {
    const v = parseAnticheatLine(TELEPORT_GPS_LINE);
    expect(v).toMatchObject({
      type: 'teleport',
      player: '萨小六',
      guid: 13028,
      latencyMs: 12,
      ip: '120.245.118.80',
      gpsDiff: { dx: 323.271, dy: 459.4375, dz: 68.95222 },
      mapId: 530,
      pos: { x: 3065.0, y: 5426.419922, z: 149.389999 },
    });
    // 无 GPS Diff 段的行不产生位移
    expect(parseAnticheatLine(SPEED_LINE)).toMatchObject({ gpsDiff: null });
  });
});
