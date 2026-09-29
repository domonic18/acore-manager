import { rollupPlayers } from '@/agent/tools/log-tools/player-rollup';

const v = (time: string, mapId: number | null, pos: { x: number; y: number; z: number } | null, gpsDiff: { dx: number; dy: number; dz: number } | null = null) => ({
  parsed: {
    time,
    typeRaw: 'Teleport-Hack',
    type: 'teleport',
    player: '萨小六',
    guid: 13028,
    latencyMs: 12,
    ip: '120.245.118.80',
    gpsDiff,
    mapId,
    pos,
    speedPctAbove: null,
    speedAllowedRate: null,
    detail: 'Teleport-Hack',
    raw: 'raw',
  },
});

// 哀嚎洞穴 3 点坐标循环 ×2（生产实锤的脚本寻路形态）+ 一次跳图带 GPS Diff
const WC_CYCLE = [
  { x: 1000, y: 2000, z: 90 },
  { x: 1037, y: 1989, z: 90 },
  { x: 1074, y: 1978, z: 90 },
];

function wcFixture() {
  const out = [];
  const base = '2026-09-27 13:4';
  const seq = ['2:06', '2:19', '2:31', '3:31', '3:44', '3:56'];
  seq.forEach((t, i) => out.push(v(`${base}${t}`, 43, WC_CYCLE[i % 3])));
  out.push(v('2026-09-27 13:44:41', 530, { x: 3065, y: 5426, z: 149 }, { dx: 323.271, dy: 459.4375, dz: 68.95222 }));
  return out;
}

describe('player-rollup', () => {
  it('builds map visits, cross-map moves with jump yards, and loop length per player', () => {
    const players = rollupPlayers(wcFixture());
    expect(players).toHaveLength(1);
    const p = players[0];
    expect(p).toMatchObject({ guid: 13028, player: '萨小六', totalViolations: 7, types: ['teleport'], loopLength: 3 });
    expect(p.maps).toEqual([
      { mapId: 43, mapName: '哀嚎洞穴', count: 6, firstTime: '2026-09-27 13:42:06', lastTime: '2026-09-27 13:43:56', types: ['teleport'] },
      { mapId: 530, mapName: '外域', count: 1, firstTime: '2026-09-27 13:44:41', lastTime: '2026-09-27 13:44:41', types: ['teleport'] },
    ]);
    expect(p.mapMoves).toEqual([
      {
        at: '2026-09-27 13:44:41',
        fromMapId: 43,
        fromMapName: '哀嚎洞穴',
        toMapId: 530,
        toMapName: '外域',
        jumpYards: 561.8,
      },
    ]);
    expect(p.mapMovesTruncated).toBe(false);
  });

  it('sorts by violation count, skips null-map events, and falls back for unknown map ids', () => {
    const others = [
      { parsed: { ...v('2026-09-27 09:00:00', 0, null).parsed, player: '路人乙', guid: 7777 } },
      { parsed: { ...v('2026-09-27 09:01:00', 0, null).parsed, player: '路人乙', guid: 7777 } },
      { parsed: { ...v('2026-09-27 09:02:00', 9999, null).parsed, player: '路人甲', guid: 42 } },
    ];
    const players = rollupPlayers([...wcFixture(), ...others]);
    expect(players).toHaveLength(3);
    expect(players[0]).toMatchObject({ guid: 13028, totalViolations: 7 });
    expect(players[1]).toMatchObject({ guid: 7777, totalViolations: 2, maps: [{ mapId: 0, mapName: '东部王国', count: 2 }], mapMoves: [] });
    const 路人 = players.find((p) => p.player === '路人甲');
    expect(路人).toMatchObject({ totalViolations: 1, mapMoves: [], loopLength: null });
    expect(路人?.maps[0]).toMatchObject({ mapId: 9999, mapName: '地图9999' });
  });
});
