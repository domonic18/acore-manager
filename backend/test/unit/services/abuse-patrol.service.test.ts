jest.mock('@/config/database', () => ({
  acmDataSource: { getRepository: jest.fn() },
  charactersDataSource: { query: jest.fn() },
  authDataSource: { query: jest.fn() },
  worldDataSource: { query: jest.fn() },
}));
jest.mock('@/repositories/abuse-patrol.repository', () => ({
  abusePatrolRepository: {
    getRecentBattles: jest.fn().mockResolvedValue([]),
    getOnlineSnapshot: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('@/config/system-config.reader', () => ({
  readDefaultRealm: jest.fn().mockResolvedValue('realm3'),
  readInspectionTrustedIps: jest.fn().mockResolvedValue(new Set<string>()),
  readRuntimeValues: jest.fn().mockResolvedValue(new Map()),
  SYSTEM_CONFIG_KEYS: {
    inspectionTrustedIps: 'inspection_trusted_ips',
    patrolBgCursor: 'patrol_bg_cursor',
  },
}));
jest.mock('@/services/ai/feishu-notify.service', () => ({
  feishuNotifyService: { sendCard: jest.fn().mockResolvedValue(true), sendText: jest.fn().mockResolvedValue(true) },
}));
jest.mock('@/middleware/request-logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { acmDataSource } from '@/config/database';
import { abusePatrolService, FindingCandidate, formatCstDateTime } from '@/services/abuse-patrol.service';
import { abusePatrolRepository, BattlePlayerRow, OnlineSnapshotRow } from '@/repositories/abuse-patrol.repository';
import { readInspectionTrustedIps, readRuntimeValues } from '@/config/system-config.reader';
import { feishuNotifyService } from '@/services/ai/feishu-notify.service';

const getRecentBattles = abusePatrolRepository.getRecentBattles as jest.Mock;
const getOnlineSnapshot = abusePatrolRepository.getOnlineSnapshot as jest.Mock;
const sendCard = feishuNotifyService.sendCard as jest.Mock;

const NOW = new Date('2026-10-03T04:00:00Z');

function mockRepo() {
  const repo = {
    findOne: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    upsert: jest.fn().mockResolvedValue(undefined),
  };
  (acmDataSource.getRepository as jest.Mock).mockReturnValue(repo);
  return repo;
}

function battleRow(overrides: Partial<BattlePlayerRow> & { characterGuid: number; accountId: number }): BattlePlayerRow {
  return {
    battlegroundId: 1901,
    type: 1,
    battleDate: '2026-10-03 11:30:00',
    name: `P${overrides.characterGuid}`,
    level: 80,
    race: 1,
    username: `acc${overrides.accountId}`,
    ip: '1.2.3.4',
    killingBlows: 30,
    deaths: 12,
    honorableKills: 25,
    bonusHonor: 5000,
    damageDone: 20000,
    healingDone: 0,
    todayKills: 100,
    todayHonorPoints: 30000,
    ...overrides,
  } as BattlePlayerRow;
}

function snapshotRow(overrides: Partial<OnlineSnapshotRow> & { guid: number; accountId: number }): OnlineSnapshotRow {
  return {
    name: `C${overrides.guid}`,
    username: `acc${overrides.accountId}`,
    level: 80,
    race: 1,
    classId: 1,
    map: 0,
    zone: 12,
    positionX: 1000,
    positionY: 2000,
    ip: '1.2.3.4',
    totalHonorPoints: 100,
    todayHonorPoints: 50,
    todayKills: 5,
    hardcore: false,
    hardcoreLevel: null,
    ...overrides,
  } as OnlineSnapshotRow;
}

describe('AbusePatrolService.detectBgHonorFarm', () => {
  it('flags a same-IP multi-account group hitting ≥2 farm signals', () => {
    const rows = [
      battleRow({ characterGuid: 1, accountId: 11, honorableKills: 30, deaths: 15, damageDone: 30000 }),
      battleRow({ characterGuid: 2, accountId: 12, honorableKills: 28, deaths: 18, damageDone: 25000, race: 2 }),
    ];
    const candidates = abusePatrolService.detectBgHonorFarm(rows, new Set(), NOW);

    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    expect(c.findingType).toBe('bg_honor_farm');
    expect(c.dedupeKey).toBe('bg_honor_farm:2026-10-03:1-2');
    expect(c.subjects).toHaveLength(2);
    expect(c.evidence).toMatchObject({ battlegroundId: 1901, sameIpAccounts: 2 });
  });

  it('does not group distinct IPs into one finding', () => {
    const rows = [
      battleRow({ characterGuid: 1, accountId: 11, ip: '1.1.1.1', honorableKills: 30, deaths: 15 }),
      battleRow({ characterGuid: 2, accountId: 12, ip: '2.2.2.2', honorableKills: 30, deaths: 15 }),
    ];
    expect(abusePatrolService.detectBgHonorFarm(rows, new Set(), NOW)).toHaveLength(0);
  });

  it('ignores a same-IP pair with healthy stats (weak signals)', () => {
    const rows = [
      battleRow({ characterGuid: 1, accountId: 11, honorableKills: 3, deaths: 1, damageDone: 40000 }),
      battleRow({ characterGuid: 2, accountId: 12, honorableKills: 4, deaths: 0, damageDone: 50000 }),
    ];
    expect(abusePatrolService.detectBgHonorFarm(rows, new Set(), NOW)).toHaveLength(0);
  });

  it('excludes trusted IPs entirely', () => {
    const rows = [
      battleRow({ characterGuid: 1, accountId: 11, ip: '10.0.0.1', honorableKills: 30, deaths: 15 }),
      battleRow({ characterGuid: 2, accountId: 12, ip: '10.0.0.1', honorableKills: 30, deaths: 15 }),
    ];
    expect(abusePatrolService.detectBgHonorFarm(rows, new Set(['10.0.0.1']), NOW)).toHaveLength(0);
  });
});

describe('AbusePatrolService.detectHardcoreCarry', () => {
  it('flags hardcore + big-level-gap main co-located on same IP/map/zone within 50yd', () => {
    const rows = [
      snapshotRow({ guid: 100, accountId: 11, hardcore: true, hardcoreLevel: 20, level: 20, positionX: 1000, positionY: 2000 }),
      snapshotRow({ guid: 200, accountId: 12, level: 80, positionX: 1020, positionY: 2030 }),
    ];
    const candidates = abusePatrolService.detectHardcoreCarry(rows, new Set(), NOW);

    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    expect(c.findingType).toBe('hardcore_carry');
    expect(c.dedupeKey).toBe('hardcore_carry:2026-10-03:100-200');
    expect(c.subjects.map((s) => s.characterName)).toEqual(['C100', 'C200']);
    expect(c.subjects.find((s) => s.characterGuid === 100)?.hardcore).toBe(true);
    expect(c.evidence.pairs).toEqual([
      expect.objectContaining({ hardcore: 'C100(Lv20)', main: 'C200(Lv80)' }),
    ]);
  });

  it('skips pairs below the level gap or in different map/zone/distance', () => {
    const near = [
      snapshotRow({ guid: 100, accountId: 11, hardcore: true, hardcoreLevel: 70, level: 70, positionX: 1000, positionY: 2000 }),
      snapshotRow({ guid: 200, accountId: 12, level: 75, positionX: 1010, positionY: 2010 }),
    ];
    expect(abusePatrolService.detectHardcoreCarry(near, new Set(), NOW)).toHaveLength(0);

    const farZone = [
      snapshotRow({ guid: 100, accountId: 11, hardcore: true, hardcoreLevel: 20, level: 20, zone: 12 }),
      snapshotRow({ guid: 200, accountId: 12, level: 80, zone: 14, positionX: 1001, positionY: 2001 }),
    ];
    expect(abusePatrolService.detectHardcoreCarry(farZone, new Set(), NOW)).toHaveLength(0);

    const tooFar = [
      snapshotRow({ guid: 100, accountId: 11, hardcore: true, hardcoreLevel: 20, level: 20, positionX: 1000, positionY: 2000 }),
      snapshotRow({ guid: 200, accountId: 12, level: 80, positionX: 1100, positionY: 2000 }),
    ];
    expect(abusePatrolService.detectHardcoreCarry(tooFar, new Set(), NOW)).toHaveLength(0);
  });

  it('requires two distinct accounts on the same IP', () => {
    const rows = [
      snapshotRow({ guid: 100, accountId: 11, hardcore: true, hardcoreLevel: 20, level: 20 }),
      snapshotRow({ guid: 200, accountId: 11, level: 80, positionX: 1001, positionY: 2001 }),
    ];
    expect(abusePatrolService.detectHardcoreCarry(rows, new Set(), NOW)).toHaveLength(0);
  });
});

describe('AbusePatrolService.persistCandidates', () => {
  const candidate: FindingCandidate = {
    findingType: 'bg_honor_farm',
    dedupeKey: 'bg_honor_farm:2026-10-03:1-2',
    detectedAt: NOW,
    subjects: [],
    evidence: {
      battlegroundId: 1901,
      battleType: 2,
      battleDate: '2026-10-03 11:30:00',
      sameIpAccounts: 2,
      avgHonorableKills: 27,
      avgDeaths: 7,
      damagePerKill: 400,
      signals: { highHK: true, highDeaths: true, lowDamage: true },
    },
  };

  it('inserts a new finding with occurrence=1 and stays silent', async () => {
    const repo = mockRepo();
    repo.findOne.mockResolvedValueOnce(null);

    const result = await abusePatrolService.persistCandidates('realm3', [candidate]);

    expect(result).toEqual({ created: 1, upgraded: 0, notified: 0 });
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ occurrenceCount: 1, status: 'open', realm: 'realm3' }));
    expect(sendCard).not.toHaveBeenCalled();
  });

  it('upgrades occurrence on duplicate dedupe key and notifies exactly at 2', async () => {
    const repo = mockRepo();
    repo.findOne
      .mockResolvedValueOnce({ id: 7, occurrenceCount: 1, dedupeKey: candidate.dedupeKey })
      .mockResolvedValueOnce({ id: 7, occurrenceCount: 2, dedupeKey: candidate.dedupeKey })
      .mockResolvedValueOnce({ id: 7, occurrenceCount: 3, dedupeKey: candidate.dedupeKey });

    const first = await abusePatrolService.persistCandidates('realm3', [candidate]);
    const second = await abusePatrolService.persistCandidates('realm3', [candidate]);
    const third = await abusePatrolService.persistCandidates('realm3', [candidate]);

    expect(first).toEqual({ created: 0, upgraded: 1, notified: 1 });
    expect(second).toEqual({ created: 0, upgraded: 1, notified: 0 });
    expect(third).toEqual({ created: 0, upgraded: 1, notified: 0 });
    expect(repo.update).toHaveBeenCalledWith(7, expect.objectContaining({ occurrenceCount: 2 }));
    expect(sendCard).toHaveBeenCalledTimes(1);
    expect(sendCard.mock.calls[0][0].header.title.content).toContain('战场互刷');
  });

  it('continues persisting the remaining findings when one fails', async () => {
    const repo = mockRepo();
    repo.findOne.mockRejectedValueOnce(new Error('pg down')).mockResolvedValueOnce(null);

    const result = await abusePatrolService.persistCandidates('realm3', [candidate, { ...candidate, dedupeKey: 'k2' }]);

    expect(result.created).toBe(1);
    expect(repo.insert).toHaveBeenCalledTimes(1);
  });
});

describe('AbusePatrolService.runBgHonorFarmScan', () => {
  it('uses the patrol cursor window by default and writes it back after the scan', async () => {
    const repo = mockRepo();
    const cursorMs = Date.now() - 3600_000;
    (readRuntimeValues as jest.Mock).mockResolvedValue(new Map([['patrol_bg_cursor', String(cursorMs)]]));
    getRecentBattles.mockResolvedValue([]);

    const result = await abusePatrolService.runBgHonorFarmScan();

    expect(getRecentBattles).toHaveBeenCalledWith(formatCstDateTime(new Date(cursorMs)));
    expect(result.candidates).toBe(0);
    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ configKey: 'patrol_bg_cursor', isSecret: false }),
      { conflictPaths: ['configKey'] },
    );
    expect(Number(repo.upsert.mock.calls[0][0].configValue)).toBeGreaterThan(cursorMs);
  });

  it('falls back to a 1h window when the cursor is missing', async () => {
    mockRepo();
    (readRuntimeValues as jest.Mock).mockResolvedValue(new Map());
    getRecentBattles.mockResolvedValue([]);

    await abusePatrolService.runBgHonorFarmScan();

    expect(getRecentBattles).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/));
  });

  it('honors the hours override for manual backfills', async () => {
    mockRepo();
    (readRuntimeValues as jest.Mock).mockResolvedValue(new Map([['patrol_bg_cursor', String(Date.now() - 3600_000)]]));
    getRecentBattles.mockResolvedValue([]);

    await abusePatrolService.runBgHonorFarmScan({ hours: 6 });

    expect(getRecentBattles).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/));
  });
});

describe('AbusePatrolService.runHardcoreCarryScan', () => {
  it('scans the online snapshot and persists findings', async () => {
    const repo = mockRepo();
    repo.findOne.mockResolvedValue(null);
    getOnlineSnapshot.mockResolvedValue([
      snapshotRow({ guid: 100, accountId: 11, hardcore: true, hardcoreLevel: 20, level: 20 }),
      snapshotRow({ guid: 200, accountId: 12, level: 80, positionX: 1001, positionY: 2001 }),
    ]);

    const result = await abusePatrolService.runHardcoreCarryScan();

    expect(result.created).toBe(1);
  });
});
