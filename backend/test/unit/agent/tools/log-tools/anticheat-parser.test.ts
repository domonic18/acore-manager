import { normalizeViolationType, parseAnticheatLine } from '@/agent/tools/log-tools/anticheat-parser';

// 样例行取自本地测试服真实日志（anticheat 模块固定格式，中英文玩家名均出现）
const SPEED_LINE =
  '2026-08-20 16:44:19 INFO [anticheat.module] AnticheatMgr:: Speed-Hack (Speed Movement at 26.598583% above allowed Server Set rate 14%.) detected player 灭团之星 (GUID Full: 0x0000000000002c36 Type: Player Low: 11318) - Latency: 85 ms - IP: 192.168.65.1 - Cheat Flagged At: .go xyz -247.699890 1065.007812 55.583813 530 1.265799';
const WATERWALK_LINE =
  '2026-08-21 09:00:01 WARNING [anticheat.module] AnticheatMgr:: Walk on Water - Hack detected player Unparalleled (GUID Full: 0x0000000000000a1b Type: Player Low: 2587) - Latency: 230 ms - IP: 1.2.3.4';

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
});
