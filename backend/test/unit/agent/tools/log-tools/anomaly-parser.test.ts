import {
  aggregateAuthFailures,
  aggregateMarkers,
  isAnomalyCandidate,
  parseAnomalyLine,
  parseAuthFailureLine,
} from '@/agent/tools/log-tools/anomaly-parser';

// loot-respawn 行取自生产 2026-09-27 Server_2026-09-27.log 实录（Entry 与 Low 之间为双空格）
const LOOT_RESPAWN =
  '2026-09-27 09:07:37 ERROR [spells.effect] Possible hacking attempt: Player 萨小五 [GUID Full: 0x00000000000032e8 Type: Player Low: 13032] tried to loot a gameobject [GUID Full: 0xf11002ad180013d2 Type: Gameobject Entry: 175384  Low: 5074] which is on respawn time without being in GM mode!';
// 以下按 AC 源码语句模板构造（2026-09 源码版本逐一对照）：
// HACK ALERT=QuestHandler.cpp:277、AntiDOS=WorldSession.cpp:1385、factionchange=CharacterHandler.cpp:1953、
// mailbox=MailHandler.cpp:44（{} 直填玩家名）
const HACK_ALERT =
  '2026-09-27 12:00:00 ERROR [network.opcode] HACK ALERT: Player 玄策 ([Player: 玄策 GUID Full: 0x00000000000030d2 Type: Player Low: 12498, Account: 5001]) is trying to complete quest (id: 7777) but he has no right to do it!';
const ANTIDOS =
  '2026-09-27 05:12:33 WARN [network] AntiDOS: Account 777, IP: 203.0.113.9, Ping: 120, Character: 挂机侠, flooding packet (opc: CMSG_MESSAGECHAT (0x1A5), count: 65)';
const FACTION_CHANGE =
  '2026-09-28 02:00:00 ERROR [entities.player.cheat] Account 5002, IP: 198.51.100.7 tried to factionchange character 玄策, but it does not belong to their account!';
const MAILBOX_CHEAT = '2026-09-27 08:00:00 WARN [cheat] 萨小六 attempted to open mailbox by using a cheat.';
// authserver 失败登录实录（2026-09-28 撞库：20 次失败全部来自该 IP）
const AUTH_FAIL =
  "2026-09-28 08:25:18 INFO [server.authserver.hack] '101.42.117.123:47958' [AuthChallenge] account WENWENJIE2023 tried to login with invalid password!";

describe('anomaly-parser', () => {
  it('parses a production loot-respawn line with player/guid/goEntry', () => {
    const v = parseAnomalyLine(LOOT_RESPAWN);
    expect(v).not.toBeNull();
    expect(v).toMatchObject({
      time: '2026-09-27 09:07:37',
      kind: 'loot-respawn',
      severity: 'medium',
      player: '萨小五',
      guid: 13032,
      detail: 'goEntry=175384',
    });
    expect(v?.raw).toBe(LOOT_RESPAWN);
  });

  it('parses HACK ALERT quest escalation as high severity', () => {
    expect(parseAnomalyLine(HACK_ALERT)).toMatchObject({
      kind: 'quest-complete-no-right',
      severity: 'high',
      player: '玄策',
      guid: 12498,
      detail: 'quest=7777',
    });
  });

  it('parses AntiDOS flooding with ip/opcode/count/ping', () => {
    expect(parseAnomalyLine(ANTIDOS)).toMatchObject({
      kind: 'antidos-flood',
      severity: 'high',
      player: '挂机侠',
      ip: '203.0.113.9',
      detail: 'opc=CMSG_MESSAGECHAT count=65 ping=120',
    });
  });

  it('parses foreign-account-access (factionchange) with ip and account detail', () => {
    expect(parseAnomalyLine(FACTION_CHANGE)).toMatchObject({
      kind: 'foreign-account-access',
      severity: 'high',
      player: null,
      guid: null,
      ip: '198.51.100.7',
      detail: 'account=5002 op=factionchange',
    });
  });

  it('parses mailbox cheat with bare player name prefix', () => {
    expect(parseAnomalyLine(MAILBOX_CHEAT)).toMatchObject({
      kind: 'mailbox-cheat',
      severity: 'medium',
      player: '萨小六',
    });
  });

  it('returns null for unmatched lines and lines without timestamps', () => {
    expect(parseAnomalyLine('2026-09-27 08:00:01 INFO [world] normal gameplay log line')).toBeNull();
    expect(parseAnomalyLine('HACK ALERT: Player X is trying to complete quest (id: 1) but no timestamp')).toBeNull();
  });

  it('pre-filter accepts hack/cheat/antidos and the factionchange "not belong" wording', () => {
    expect(isAnomalyCandidate(LOOT_RESPAWN)).toBe(true);
    expect(isAnomalyCandidate(MAILBOX_CHEAT)).toBe(true);
    expect(isAnomalyCandidate(FACTION_CHANGE)).toBe(true);
    expect(isAnomalyCandidate('2026-09-27 08:00:01 INFO [world] player casts fireball')).toBe(false);
  });

  describe('aggregateMarkers', () => {
    const loot1 = parseAnomalyLine(LOOT_RESPAWN)!;
    const loot2 = parseAnomalyLine(LOOT_RESPAWN.replace('09:07:37', '21:30:00'))!;
    const hack = parseAnomalyLine(HACK_ALERT)!;

    it('groups by guid across kinds with worst severity and time bounds', () => {
      const aggs = aggregateMarkers([loot1, hack, loot2]);
      // loot 归萨小五 guid:13032，HACK ALERT 归玄策 guid:12498（GetPlayerInfo 双 Player 形态）
      expect(aggs).toHaveLength(2);
      const lootAgg = aggs.find((a) => a.guid === 13032)!;
      expect(lootAgg).toMatchObject({ key: 'guid:13032', player: '萨小五', total: 2, worstSeverity: 'medium' });
      expect(lootAgg.kinds).toHaveLength(1);
      expect(lootAgg.kinds[0]).toMatchObject({ kind: 'loot-respawn', count: 2, firstTime: '2026-09-27 09:07:37', lastTime: '2026-09-27 21:30:00' });
      expect(lootAgg.kinds[0].samples).toHaveLength(2);
      expect(aggs.find((a) => a.guid === 12498)).toMatchObject({ key: 'guid:12498', total: 1, worstSeverity: 'high' });
    });

    it('falls back to ip key when guid/player absent, and name key otherwise', () => {
      const faction = parseAnomalyLine(FACTION_CHANGE)!;
      const mailbox = parseAnomalyLine(MAILBOX_CHEAT)!;
      const aggs = aggregateMarkers([faction, mailbox]);
      expect(aggs.map((a) => a.key).sort()).toEqual(['ip:198.51.100.7', 'name:萨小六']);
    });

    it('caps result at limit (tool passes 21 to detect truncation)', () => {
      const many = Array.from({ length: 25 }, (_, i) => ({ ...loot1, guid: 100 + i, raw: `row ${i}` }));
      expect(aggregateMarkers(many)).toHaveLength(20);
      expect(aggregateMarkers(many, 21)).toHaveLength(21);
    });
  });

  describe('authserver failed logins', () => {
    const fail = (time: string, ip: string, account: string) => parseAuthFailureLine(`${time} INFO [server.authserver.hack] '${ip}:47958' [AuthChallenge] account ${account} tried to login with invalid password!`)!;

    it('parses a production credential-stuffing line', () => {
      expect(parseAuthFailureLine(AUTH_FAIL)).toEqual({
        time: '2026-09-28 08:25:18',
        ip: '101.42.117.123',
        account: 'WENWENJIE2023',
      });
      expect(parseAuthFailureLine('2026-09-28 08:25:18 INFO [server.authserver] normal auth flow')).toBeNull();
    });

    it('flags stuffing: >=5 distinct accounts or >=10 attempts from one ip', () => {
      const stuffing = ['a1', 'a2', 'a3', 'a4', 'a5'].map((a, i) => fail(`2026-09-28 08:0${i}:00`, '101.42.117.123', a));
      expect(aggregateAuthFailures(stuffing)[0]).toMatchObject({
        ip: '101.42.117.123',
        count: 5,
        distinctAccounts: 5,
        bruteForceSuspect: true,
        firstTime: '2026-09-28 08:00:00',
        lastTime: '2026-09-28 08:04:00',
      });

      const sameAccount = Array.from({ length: 9 }, (_, i) => fail(`2026-09-28 09:${String(i).padStart(2, '0')}:00`, '1.2.3.4', 'slowguess'));
      expect(aggregateAuthFailures(sameAccount)[0]).toMatchObject({ count: 9, distinctAccounts: 1, bruteForceSuspect: false });
      sameAccount.push(fail('2026-09-28 09:09:00', '1.2.3.4', 'slowguess'));
      expect(aggregateAuthFailures(sameAccount)[0]).toMatchObject({ count: 10, bruteForceSuspect: true });
    });

    it('sorts ips by attempt count and keeps per-account counts sorted', () => {
      const events = [
        fail('2026-09-28 10:00:00', '5.6.7.8', 'aa'),
        ...Array.from({ length: 3 }, (_, i) => fail(`2026-09-28 10:0${i}:00`, '5.6.7.9', 'bb')),
        ...Array.from({ length: 4 }, (_, i) => fail(`2026-09-28 10:0${i}:00`, '5.6.7.9', `cc${i}`)),
      ];
      const aggs = aggregateAuthFailures(events);
      expect(aggs.map((a) => [a.ip, a.count, a.bruteForceSuspect])).toEqual([
        ['5.6.7.9', 7, true],
        ['5.6.7.8', 1, false],
      ]);
      expect(aggs[0].accounts).toEqual([
        { account: 'bb', count: 3 },
        { account: 'cc0', count: 1 },
        { account: 'cc1', count: 1 },
        { account: 'cc2', count: 1 },
        { account: 'cc3', count: 1 },
      ]);
    });

    it('drops trusted ips entirely before aggregation (owner web-server false positive)', () => {
      const events = [
        ...Array.from({ length: 6 }, (_, i) => fail(`2026-09-28 11:0${i}:00`, '101.42.117.123', `own${i}`)),
        fail('2026-09-28 11:00:00', '9.9.9.9', 'attacker1'),
        fail('2026-09-28 11:01:00', '9.9.9.9', 'attacker2'),
      ];
      const aggs = aggregateAuthFailures(events, 10, new Set(['101.42.117.123']));
      // 受信 IP 整体剔除，即使达到爆破阈值也不出现在证据中；非受信 IP 不受影响
      expect(aggs.map((a) => a.ip)).toEqual(['9.9.9.9']);
      expect(aggs[0]).toMatchObject({ count: 2, distinctAccounts: 2, bruteForceSuspect: false });
      // 空白名单 = 行为同原逻辑
      expect(aggregateAuthFailures(events)).toHaveLength(2);
    });
  });
});
