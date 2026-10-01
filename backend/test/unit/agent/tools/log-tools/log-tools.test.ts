jest.mock('@/config/database', () => ({
  authDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  charactersDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  worldDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  acmDataSource: { getRepository: jest.fn(() => ({ insert: jest.fn().mockResolvedValue({}), find: jest.fn().mockResolvedValue([]) })) },
}));

jest.mock('@/shared/utils/cos.util', () => ({
  cosGetObjectJson: jest.fn().mockResolvedValue(null),
  cosGetObjectBuffer: jest.fn().mockResolvedValue(Buffer.alloc(0)),
}));

import { execSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, promises as fsp, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { cosGetObjectBuffer, cosGetObjectJson } from '@/shared/utils/cos.util';
import { acmDataSource, charactersDataSource } from '@/config/database';
import { clearTools, exportTools } from '@/agent/tools/registry';
import { clearWorkspace, manifestKey, workspaceDir } from '@/agent/tools/log-tools/log-workspace';
import { registerAllTools } from '@/agent/tools';

const jsonMock = cosGetObjectJson as jest.Mock;
const bufferMock = cosGetObjectBuffer as jest.Mock;

const SAMPLE_LINES = [
  '2026-08-20 16:44:19 INFO [anticheat.module] AnticheatMgr:: Speed-Hack (26% above) detected player 灭团之星 (GUID Full: 0x2c36 Type: Player Low: 11318) - Latency: 85 ms - IP: 192.168.65.1 - Cheat Flagged At: .go xyz -247.699890 1065.007812 55.583813 530 1.265799',
  '2026-08-20 16:44:22 INFO [anticheat.module] AnticheatMgr:: Speed-Hack (27% above) detected player 灭团之星 (GUID Full: 0x2c36 Type: Player Low: 11318) - Latency: 95 ms - IP: 192.168.65.1 - Cheat Flagged At: .go xyz -248 1065 55 530 1.3',
  '2026-08-20 17:00:00 INFO [anticheat.module] AnticheatMgr:: Walk on Water - Hack detected player Unparalleled (GUID Full: 0xa1b Type: Player Low: 2587) - Latency: 230 ms - IP: 10.0.0.1',
];

function toolFn(name: string): { invoke: (a: unknown) => Promise<Record<string, unknown>> } {
  const found = exportTools().find((t) => (t as { name?: string }).name === name);
  if (!found) throw new Error(`tool ${name} not registered`);
  return found as unknown as { invoke: (a: unknown) => Promise<Record<string, unknown>> };
}

const REALM = 'test-realm';
const DATE = '2026-08-20';

async function seedWorkspaceViaFetch(): Promise<void> {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'acm-log-fixture-'));
  writeFileSync(join(fixtureDir, `anticheat_${DATE}.log`), SAMPLE_LINES.join('\n') + '\n');
  const archive = join(fixtureDir, 'out.tar.gz');
  execSync(`tar -czf ${archive} -C ${fixtureDir} anticheat_${DATE}.log`);
  bufferMock.mockResolvedValueOnce(await fsp.readFile(archive));
  await toolFn('fetch_log_archive').invoke({ date: DATE, type: 'anticheat', realm: REALM });
}

// parse_server_anomalies 前置是 fetch_log_archive 解压产物——直接写工作区等价形态
function seedServerWorkspace(): void {
  const serverLines = [
    '2026-09-27 01:30:49 ERROR [spells.effect] Possible hacking attempt: Player 古贰丹 [GUID Full: 0x000000000000133d Type: Player Low: 4925] tried to loot a gameobject [GUID Full: 0xf11002c41f002502 Type: Gameobject Entry: 181279  Low: 9474] which is on respawn time without being in GM mode!',
    '2026-09-27 09:07:37 ERROR [spells.effect] Possible hacking attempt: Player 萨小五 [GUID Full: 0x00000000000032e8 Type: Player Low: 13032] tried to loot a gameobject [GUID Full: 0xf11002ad180013d2 Type: Gameobject Entry: 175384  Low: 5074] which is on respawn time without being in GM mode!',
    '2026-09-27 09:12:00 ERROR [spells.effect] Possible hacking attempt: Player 萨小五 [GUID Full: 0x00000000000032e8 Type: Player Low: 13032] tried to loot a gameobject [GUID Full: 0xf11002ad180013d2 Type: Gameobject Entry: 175384  Low: 5074] which is on respawn time without being in GM mode!',
    '2026-09-27 09:13:00 INFO [world] normal gameplay line',
  ];
  const authLines = [
    "2026-09-28 08:25:18 INFO [server.authserver.hack] '101.42.117.123:47958' [AuthChallenge] account WENWENJIE2023 tried to login with invalid password!",
    "2026-09-28 08:52:56 INFO [server.authserver.hack] '101.42.117.123:47464' [AuthChallenge] account CTRL2356 tried to login with invalid password!",
  ];
  mkdirSync(workspaceDir(REALM, DATE, 'worldserver'), { recursive: true });
  mkdirSync(workspaceDir(REALM, DATE, 'authserver'), { recursive: true });
  writeFileSync(join(workspaceDir(REALM, DATE, 'worldserver'), `Server_${DATE}.log`), serverLines.join('\n') + '\n');
  writeFileSync(join(workspaceDir(REALM, DATE, 'authserver'), `Auth_${DATE}.log`), authLines.join('\n') + '\n');
}

describe('log-tools', () => {
  beforeEach(() => {
    clearTools();
    registerAllTools();
    clearWorkspace();
    jsonMock.mockReset().mockResolvedValue(null);
    bufferMock.mockReset().mockResolvedValue(Buffer.alloc(0));
  });

  afterEach(() => clearWorkspace());

  it('get_log_manifest reports absence clearly', async () => {
    const result = await toolFn('get_log_manifest').invoke({ date: DATE, realm: REALM });
    expect(result).toMatchObject({ present: false });
    expect(jsonMock).toHaveBeenCalledWith(manifestKey(REALM, DATE));
  });

  it('get_log_manifest degrades gracefully when COS is unavailable instead of throwing', async () => {
    jsonMock.mockRejectedValueOnce(new Error('COS 未配置（需要 TENCENT_SECRET_ID / TENCENT_SECRET_KEY / COS_BUCKET / COS_REGION）'));
    const result = await toolFn('get_log_manifest').invoke({ date: DATE, realm: REALM });
    expect(result).toMatchObject({ present: false });
    expect(String(result.note)).toContain('读取日志清单失败');
  });

  it('fetch_log_archive degrades gracefully when COS is unavailable instead of throwing', async () => {
    bufferMock.mockRejectedValueOnce(new Error('COS 未配置（需要 TENCENT_SECRET_ID / TENCENT_SECRET_KEY / COS_BUCKET / COS_REGION）'));
    const result = await toolFn('fetch_log_archive').invoke({ date: DATE, type: 'anticheat', realm: REALM });
    expect(result.files).toEqual([]);
    expect(String(result.note)).toContain('拉取日志失败');
  });

  it('get_log_manifest checks completeness against the four expected types', async () => {
    jsonMock.mockResolvedValueOnce({
      realm: REALM,
      date: DATE,
      files: [
        { type: 'worldserver', file: 'worldserver.tar.gz', size: 1, md5: 'x' },
        { type: 'authserver', file: 'authserver.tar.gz', size: 1, md5: 'x' },
        { type: 'anticheat', file: 'anticheat.tar.gz', size: 1, md5: 'x' },
      ],
    });
    const result = await toolFn('get_log_manifest').invoke({ date: DATE, realm: REALM });
    expect(result.present).toBe(true);
    expect(result.missingTypes).toEqual(['crash']);
  });

  it('fetch_log_archive extracts and counts lines, then caches on repeat calls', async () => {
    await seedWorkspaceViaFetch();
    const again = await toolFn('fetch_log_archive').invoke({ date: DATE, type: 'anticheat', realm: REALM });
    expect(again.cached).toBe(true);
    expect((again.files as { lines: number }[])[0].lines).toBe(SAMPLE_LINES.length);
  });

  it('parse_anticheat_violations aggregates by player×type×map with latency and evidence', async () => {
    await seedWorkspaceViaFetch();
    const result = await toolFn('parse_anticheat_violations').invoke({ from: DATE, to: DATE, realm: REALM });
    expect(result.totalViolations).toBe(3);
    const aggregates = result.aggregates as {
      guid: number;
      type: string;
      count: number;
      latency: { avg: number };
      evidence: string[];
    }[];
    expect(aggregates).toHaveLength(2);
    expect(aggregates[0]).toMatchObject({ guid: 11318, type: 'speed', mapId: 530, count: 2 });
    expect(aggregates[0].latency).toMatchObject({ min: 85, max: 95, avg: 90 });
    expect(aggregates[0].evidence).toHaveLength(2);
    expect(aggregates[1]).toMatchObject({ guid: 2587, type: 'waterwalk', mapId: null });
  });

  it('parse_anticheat_violations applies type filter and warns on empty workspace', async () => {
    await seedWorkspaceViaFetch();
    const filtered = await toolFn('parse_anticheat_violations').invoke({ from: DATE, to: DATE, realm: REALM, type: 'speed' });
    expect(filtered.totalViolations).toBe(2);

    clearWorkspace();
    expect(existsSync(workspaceDir(REALM, DATE, 'anticheat'))).toBe(false);
    const empty = await toolFn('parse_anticheat_violations').invoke({ from: DATE, to: DATE, realm: REALM });
    expect(empty.aggregates).toEqual([]);
    expect(String(empty.note)).toContain('fetch_log_archive');
  });

  it('parse_anticheat_violations explain annotates aura/exemption signals', async () => {
    await seedWorkspaceViaFetch();
    (charactersDataSource.query as jest.Mock).mockResolvedValueOnce([{ guid: 2587, spell: 546 }]);
    (acmDataSource.getRepository as jest.Mock).mockReset().mockImplementation((entity: { name: string }) =>
      entity.name === 'AiAnticheatExemption'
        ? {
            find: jest.fn().mockResolvedValue([{ characterGuid: 2587, violationType: 'waterwalk', mapId: null, reason: '水面贴图误判' }]),
          }
        : { insert: jest.fn().mockResolvedValue({}), find: jest.fn().mockResolvedValue([]) },
    );

    const result = await toolFn('parse_anticheat_violations').invoke({ from: DATE, to: DATE, realm: REALM, explain: true });
    expect(result.explainNote).toContain('快照');
    const aggregates = result.aggregates as {
      guid: number;
      suggestedAction?: string;
      falsePositiveSignals?: { kind: string }[];
    }[];
    expect(aggregates[0]).toMatchObject({ guid: 11318, suggestedAction: 'investigate' });
    expect(aggregates[1]).toMatchObject({ guid: 2587, suggestedAction: 'warning' });
    expect(aggregates[1].falsePositiveSignals?.map((s) => s.kind).sort()).toEqual(['aura', 'exemption', 'latency']);
  });

  it('parse_server_anomalies aggregates server markers and auth failures from workspace', async () => {
    seedServerWorkspace();
    const result = await toolFn('parse_server_anomalies').invoke({ from: DATE, to: DATE, realm: REALM });
    expect(result.totalMarkers).toBe(3);
    expect(result.totalLines).toBe(6);
    expect(String(result.lootRespawnNote)).toContain('采集外挂判据');
    const players = result.players as { guid: number; total: number; worstSeverity: string; kinds: { kind: string; count: number }[] }[];
    expect(players).toHaveLength(2);
    expect(players[0]).toMatchObject({ guid: 13032, total: 2, worstSeverity: 'medium' });
    expect(players[0].kinds[0]).toMatchObject({ kind: 'loot-respawn', count: 2 });
    expect(players[1]).toMatchObject({ guid: 4925, total: 1 });

    const authFailures = result.authFailures as { ip: string; count: number; distinctAccounts: number; bruteForceSuspect: boolean }[];
    expect(authFailures).toHaveLength(1);
    expect(authFailures[0]).toMatchObject({ ip: '101.42.117.123', count: 2, distinctAccounts: 2, bruteForceSuspect: false });
  });

  it('parse_server_anomalies reports empty workspace with a fetch hint', async () => {
    const result = await toolFn('parse_server_anomalies').invoke({ from: DATE, to: DATE, realm: REALM });
    expect(result).toMatchObject({ totalMarkers: 0, players: [], authFailures: [] });
    expect(String(result.note)).toContain('fetch_log_archive');
  });
});
