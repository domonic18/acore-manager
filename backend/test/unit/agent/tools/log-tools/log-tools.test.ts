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
import { existsSync, mkdtempSync, promises as fsp, writeFileSync } from 'fs';
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
    jsonMock.mockRejectedValueOnce(new Error('COS 未配置（需要 COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION）'));
    const result = await toolFn('get_log_manifest').invoke({ date: DATE, realm: REALM });
    expect(result).toMatchObject({ present: false });
    expect(String(result.note)).toContain('读取日志清单失败');
  });

  it('fetch_log_archive degrades gracefully when COS is unavailable instead of throwing', async () => {
    bufferMock.mockRejectedValueOnce(new Error('COS 未配置（需要 COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION）'));
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
    expect(aggregates[1]).toMatchObject({ guid: 2587, suggestedAction: 'review' });
    expect(aggregates[1].falsePositiveSignals?.map((s) => s.kind).sort()).toEqual(['aura', 'exemption', 'latency']);
  });
});
