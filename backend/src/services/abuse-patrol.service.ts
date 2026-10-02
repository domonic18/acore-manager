import { acmDataSource } from '@/config/database';
import {
  readDefaultRealm,
  readInspectionTrustedIps,
  readRuntimeValues,
  SYSTEM_CONFIG_KEYS,
} from '@/config/system-config.reader';
import { logger } from '@/middleware/request-logger';
import {
  PatrolFinding,
  PatrolFindingSubject,
  PatrolFindingType,
} from '@/entities/acm/patrol-finding.entity';
import { AcmSystemConfig } from '@/entities/acm/system-config.entity';
import {
  abusePatrolRepository,
  BattlePlayerRow,
  OnlineSnapshotRow,
} from '@/repositories/abuse-patrol.repository';
import { feishuNotifyService } from '@/services/ai/feishu-notify.service';
import { formatCstDate } from '@/shared/utils/cst-date.util';

// 反滥用巡检（需求一/二）：战场挂机互刷 + 硬核被非硬核大号带级。
// 判定为疑似级，不自动处罚；GM 在巡检报告「违规巡检」tab 人工处置
//（警告邮件 / 深度分析 / 荣誉调整）。同类发现同日去重，重复命中轮次+1，≥2 轮推飞书告警。

// 互刷特征阈值（pvpstats 战后结算，组内同 IP 多账号 + 多项命中才判嫌疑）
const BG_MIN_SAME_IP_ACCOUNTS = 2;
const BG_MIN_AVG_HONORABLE_KILLS = 20;
const BG_MIN_AVG_DEATHS = 5;
const BG_MAX_DAMAGE_PER_KILL = 1500;
const BG_MIN_SUSPECT_SIGNALS = 2;

// 带级特征：非组队护送（mod-challenge-modes 禁跨模式组队），同图同区近坐标 + 同 IP
const CARRY_MIN_LEVEL_GAP = 10;
const CARRY_MAX_DISTANCE_YD = 50;
const CARRY_MIN_SAME_IP_ACCOUNTS = 2;

// 游标缺失/损坏时的兜底扫描窗口
const DEFAULT_SCAN_WINDOW_HOURS = 1;

const CST_OFFSET_MS = 8 * 3600 * 1000;

// 告警卡可读化：战场类型号 → 名称（AC BattlegroundTypeId 常见值，未收录回落编号原文）
const BG_TYPE_LABEL: Record<number, string> = {
  1: '奥特兰克山谷',
  2: '战歌峡谷',
  3: '阿拉希盆地',
  4: '风暴之眼',
  5: '远古海滩',
  7: '征服之岛',
};

export interface FindingCandidate {
  findingType: PatrolFindingType;
  dedupeKey: string;
  detectedAt: Date;
  subjects: PatrolFindingSubject[];
  evidence: Record<string, any>;
}

export interface PatrolScanResult {
  scannedFrom: string;
  scannedTo: string;
  candidates: number;
  created: number;
  upgraded: number;
  notified: number;
}

// DB datetime（服务器本地 CST）用 'YYYY-MM-DD HH:MM:SS'
export function formatCstDateTime(d: Date): string {
  return new Date(d.getTime() + CST_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ');
}

function dedupeKeyFor(type: PatrolFindingType, dayKey: string, guids: number[]): string {
  const ids = [...guids].sort((a, b) => a - b).join('-');
  return `${type}:${dayKey}:${ids}`;
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

export class AbusePatrolService {
  // ---------- 需求一：战场互刷 ----------

  // 数据源纯检测（不落库），便于单测：同 IP 多开账号在同一战场、跨阵营互杀特征评分
  detectBgHonorFarm(rows: BattlePlayerRow[], trustedIps: Set<string>, now: Date = new Date()): FindingCandidate[] {
    const filtered = rows.filter((r) => r.ip && !trustedIps.has(r.ip));
    const byBattle = groupBy(filtered, (r) => String(r.battlegroundId));
    const candidates: FindingCandidate[] = [];

    for (const [battleId, players] of byBattle) {
      const byIp = groupBy(players, (p) => p.ip);
      for (const [ip, ipPlayers] of byIp) {
        const accounts = new Set(ipPlayers.map((p) => p.accountId));
        if (accounts.size < BG_MIN_SAME_IP_ACCOUNTS) continue;

        const n = ipPlayers.length;
        const totalHK = ipPlayers.reduce((s, p) => s + p.honorableKills, 0);
        const totalDeaths = ipPlayers.reduce((s, p) => s + p.deaths, 0);
        const totalDamage = ipPlayers.reduce((s, p) => s + p.damageDone, 0);
        const avgHK = totalHK / n;
        const avgDeaths = totalDeaths / n;
        const damagePerKill = totalDamage / Math.max(1, totalHK);

        // 特征信号：高 HK / 高死亡率（互杀互喂）/ 低伤害快杀；≥2 项命中判嫌疑
        const signals = [avgHK >= BG_MIN_AVG_HONORABLE_KILLS, avgDeaths >= BG_MIN_AVG_DEATHS, damagePerKill < BG_MAX_DAMAGE_PER_KILL];
        const signalCount = signals.filter(Boolean).length;
        if (signalCount < BG_MIN_SUSPECT_SIGNALS) continue;

        const battleDate = ipPlayers[0].battleDate;
        const guids = ipPlayers.map((p) => p.characterGuid);
        candidates.push({
          findingType: 'bg_honor_farm',
          dedupeKey: dedupeKeyFor('bg_honor_farm', battleDate.slice(0, 10), guids),
          detectedAt: now,
          subjects: ipPlayers.map((p) => ({
            accountId: p.accountId,
            accountName: p.username,
            characterGuid: p.characterGuid,
            characterName: p.name,
            level: p.level,
            hardcore: false,
            ip,
            extra: {
              race: p.race,
              honorableKills: p.honorableKills,
              deaths: p.deaths,
              killingBlows: p.killingBlows,
              bonusHonor: p.bonusHonor,
              damageDone: p.damageDone,
              todayHonorPoints: p.todayHonorPoints,
            },
          })),
          evidence: {
            battlegroundId: Number(battleId),
            battleType: players[0].type,
            battleDate,
            avgHonorableKills: Math.round(avgHK * 10) / 10,
            avgDeaths: Math.round(avgDeaths * 10) / 10,
            damagePerKill: Math.round(damagePerKill),
            signals: { highHK: signals[0], highDeaths: signals[1], lowDamage: signals[2] },
            sameIpAccounts: accounts.size,
          },
        });
      }
    }
    return candidates;
  }

  // ---------- 需求二：硬核被带 ----------

  // 在线快照纯检测：同 IP 组内 硬核(低级) + 非硬核(等级差≥10) 同图同区 ≤50 码
  detectHardcoreCarry(
    snapshot: OnlineSnapshotRow[],
    trustedIps: Set<string>,
    now: Date = new Date(),
  ): FindingCandidate[] {
    const filtered = snapshot.filter((r) => r.ip && !trustedIps.has(r.ip));
    const byIp = groupBy(filtered, (r) => r.ip);
    const candidates: FindingCandidate[] = [];

    for (const [ip, members] of byIp) {
      const accounts = new Set(members.map((m) => m.accountId));
      if (accounts.size < CARRY_MIN_SAME_IP_ACCOUNTS) continue;

      const hardcore = members.filter((m) => m.hardcore);
      const mains = members.filter((m) => !m.hardcore);
      const pairs: Array<{ hardcore: OnlineSnapshotRow; main: OnlineSnapshotRow; distance: number }> = [];
      for (const hc of hardcore) {
        for (const main of mains) {
          if (main.level - (hc.hardcoreLevel ?? 0) < CARRY_MIN_LEVEL_GAP) continue;
          if (main.map !== hc.map || main.zone !== hc.zone) continue;
          const dx = main.positionX - hc.positionX;
          const dy = main.positionY - hc.positionY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance <= CARRY_MAX_DISTANCE_YD) pairs.push({ hardcore: hc, main, distance: Math.round(distance * 10) / 10 });
        }
      }
      if (pairs.length === 0) continue;

      const involved = new Map<number, OnlineSnapshotRow>();
      for (const pair of pairs) {
        involved.set(pair.hardcore.guid, pair.hardcore);
        involved.set(pair.main.guid, pair.main);
      }
      const rows = [...involved.values()];

      candidates.push({
        findingType: 'hardcore_carry',
        dedupeKey: dedupeKeyFor('hardcore_carry', formatCstDate(now), rows.map((r) => r.guid)),
        detectedAt: now,
        subjects: rows.map((r) => ({
          accountId: r.accountId,
          accountName: r.username,
          characterGuid: r.guid,
          characterName: r.name,
          level: r.level,
          hardcore: r.hardcore,
          ip,
          extra: r.hardcore ? { hardcoreLevel: r.hardcoreLevel } : {},
        })),
        evidence: {
          pairs: pairs.map((p) => ({
            hardcore: `${p.hardcore.name}(Lv${p.hardcore.hardcoreLevel})`,
            main: `${p.main.name}(Lv${p.main.level})`,
            map: p.hardcore.map,
            zone: p.hardcore.zone,
            distanceYd: p.distance,
          })),
          coords: Object.fromEntries(
            rows.map((r) => [r.guid, { map: r.map, zone: r.zone, x: r.positionX, y: r.positionY }]),
          ),
        },
      });
    }
    return candidates;
  }

  // ---------- 落库 / 去重 / 告警 ----------

  // dedupe_key 幂等：首见落库 occurrence=1，重复命中轮次+1 并刷新发现时间与证据；
  // 恰好升到 2 轮时推飞书（首轮仅记录，规避坐标 15min 滞后单轮误报；≥3 轮不再重复打扰）
  async persistCandidates(realm: string, candidates: FindingCandidate[]): Promise<{ created: number; upgraded: number; notified: number }> {
    const repo = acmDataSource.getRepository(PatrolFinding);
    let created = 0;
    let upgraded = 0;
    let notified = 0;

    for (const candidate of candidates) {
      try {
        const existing = await repo.findOne({ where: { dedupeKey: candidate.dedupeKey } });
        if (!existing) {
          await repo.insert({
            findingType: candidate.findingType,
            realm,
            detectedAt: candidate.detectedAt,
            occurrenceCount: 1,
            status: 'open',
            dedupeKey: candidate.dedupeKey,
            subjectsJson: candidate.subjects,
            evidenceJson: candidate.evidence,
          });
          created += 1;
          continue;
        }

        const occurrence = existing.occurrenceCount + 1;
        await repo.update(existing.id, {
          occurrenceCount: occurrence,
          detectedAt: candidate.detectedAt,
          subjectsJson: candidate.subjects,
          evidenceJson: candidate.evidence,
        });
        upgraded += 1;
        if (occurrence === 2) {
          const ok = await this.notifyFinding(realm, candidate.findingType, occurrence, candidate);
          if (ok) notified += 1;
        }
      } catch (err) {
        logger.error(`[abuse-patrol] finding persist failed (${candidate.dedupeKey}): ${(err as Error).message}`);
      }
    }
    return { created, upgraded, notified };
  }

  private async notifyFinding(realm: string, type: PatrolFindingType, occurrence: number, candidate: FindingCandidate): Promise<boolean> {
    const label = type === 'bg_honor_farm' ? '战场互刷嫌疑' : '硬核被带嫌疑';
    const mdEl = (content: string) => ({ tag: 'markdown', content });

    const subjectLines = candidate.subjects.map((s) => {
      const levelText = s.hardcore ? `硬核 Lv${s.extra?.hardcoreLevel ?? '?'}` : `Lv${s.level}`;
      return `- **${s.characterName}**（${levelText} · 账号 ${s.accountName || `ID ${s.accountId}`}）· IP ${s.ip}`;
    });

    let evidenceLines: string[];
    if (type === 'bg_honor_farm') {
      const ev = candidate.evidence as {
        battleType: number;
        battleDate: string;
        sameIpAccounts: number;
        avgHonorableKills: number;
        avgDeaths: number;
        damagePerKill: number;
        signals: { highHK: boolean; highDeaths: boolean; lowDamage: boolean };
      };
      const bgName = BG_TYPE_LABEL[ev.battleType] ?? `战场编号 ${ev.battleType}`;
      const signals = [
        ev.signals.highHK && '荣誉击杀异常高',
        ev.signals.highDeaths && '死亡次数异常多',
        ev.signals.lowDamage && '每次击杀伤害远低于正常',
      ].filter(Boolean) as string[];
      evidenceLines = [
        `- 同一 IP 下 **${ev.sameIpAccounts} 个账号**同场对局（${bgName} · ${ev.battleDate.slice(5, 16)}）`,
        `- 人均荣誉击杀 **${ev.avgHonorableKills}**、人均死亡 **${ev.avgDeaths}**、每次击杀平均仅造成 **${ev.damagePerKill}** 点伤害`,
        `- 命中特征：${signals.join('、')}——符合互相击杀刷荣誉的行为模式`,
      ];
    } else {
      const ev = candidate.evidence as { pairs: Array<{ hardcore: string; main: string; map: number; zone: number; distanceYd: number }> };
      evidenceLines = [
        ...ev.pairs.map(
          (p) => `- 硬核角色 **${p.hardcore}** 与大号 **${p.main}** 同地图同区域共现，直线距离仅 **${p.distanceYd}** 码`,
        ),
        `- 命中特征：登录 IP 相同且等级差距明显——疑似大号护送硬核角色升级`,
      ];
    }

    const elements = [
      mdEl(`<font color='red'>**第 ${occurrence} 轮扫描命中**</font>：同一批角色被反复检出，达到告警阈值才推送（首轮仅记录，用于排除偶发同位置的误报）`),
      { tag: 'hr' },
      mdEl(['**涉案角色**', ...subjectLines].join('\n')),
      mdEl(['**判定依据**', ...evidenceLines].join('\n')),
      { tag: 'hr' },
      mdEl(`<font color='grey'>属疑似判定而非坐实，请人工核实后处置。入口：巡检报告详情 →「违规巡检」页（警告邮件 / 深度分析 / 荣誉调整）· realm: ${realm}</font>`),
    ];

    const ok = await feishuNotifyService.sendCard({
      schema: '2.0',
      header: { template: 'red', title: { tag: 'plain_text', content: `反滥用巡检告警：${label}` } },
      body: { elements },
    });
    if (!ok) logger.warn(`[abuse-patrol] feishu notify failed (${candidate.dedupeKey})`);
    return ok;
  }

  // ---------- 扫描入口（job 调用） ----------

  // 增量窗口：缺省 [上次游标, now]；hours 覆盖（手动补扫）；无游标回退默认 1h
  async runBgHonorFarmScan(params: { hours?: number } = {}): Promise<PatrolScanResult> {
    const now = new Date();
    const from = params.hours
      ? new Date(now.getTime() - params.hours * 3600_000)
      : await this.resolveCursorFrom(now);
    const fromDateTime = formatCstDateTime(from);

    const [realm, trustedIps, rows] = await Promise.all([
      readDefaultRealm(),
      readInspectionTrustedIps(),
      abusePatrolRepository.getRecentBattles(fromDateTime),
    ]);
    const candidates = this.detectBgHonorFarm(rows, trustedIps, now);
    const { created, upgraded, notified } = await this.persistCandidates(realm, candidates);
    await this.writeCursor(now);

    logger.info(
      `[abuse-patrol] bg-honor-farm scan ${fromDateTime} ~ ${formatCstDateTime(now)}: candidates=${candidates.length} created=${created} upgraded=${upgraded} notified=${notified}`,
    );
    return { scannedFrom: fromDateTime, scannedTo: formatCstDateTime(now), candidates: candidates.length, created, upgraded, notified };
  }

  async runHardcoreCarryScan(): Promise<PatrolScanResult> {
    const now = new Date();
    const [realm, trustedIps, snapshot] = await Promise.all([
      readDefaultRealm(),
      readInspectionTrustedIps(),
      abusePatrolRepository.getOnlineSnapshot(),
    ]);
    const candidates = this.detectHardcoreCarry(snapshot, trustedIps, now);
    const { created, upgraded, notified } = await this.persistCandidates(realm, candidates);

    logger.info(
      `[abuse-patrol] hardcore-carry scan @ ${formatCstDateTime(now)}: online=${snapshot.length} candidates=${candidates.length} created=${created} upgraded=${upgraded} notified=${notified}`,
    );
    return { scannedFrom: '', scannedTo: formatCstDateTime(now), candidates: candidates.length, created, upgraded, notified };
  }

  // ---------- 发现查询 / 处置（路由调用） ----------

  async listFindings(filter: { date?: string; type?: string; status?: string }, page = 1, pageSize = 20): Promise<{ items: PatrolFinding[]; total: number }> {
    const qb = acmDataSource
      .getRepository(PatrolFinding)
      .createQueryBuilder('f');
    if (filter.type) qb.andWhere('f.findingType = :type', { type: filter.type });
    if (filter.status) qb.andWhere('f.status = :status', { status: filter.status });
    if (filter.date) {
      // detected_at 存 CST 墙钟（写入方按 +08:00 序列化），比较须用 CST 墙钟字符串；
      // 传 JS Date 会按进程本地时区（容器 UTC）序列化成 UTC 墙钟，日窗恒错位 8h
      const startMs = new Date(`${filter.date}T00:00:00+08:00`).getTime();
      qb.andWhere('f.detectedAt >= :start AND f.detectedAt < :end', {
        start: formatCstDateTime(new Date(startMs)),
        end: formatCstDateTime(new Date(startMs + 86400_000)),
      });
    }
    const [items, total] = await qb
      .orderBy('f.detectedAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { items, total };
  }

  async updateFindingStatus(id: number, status: 'open' | 'actioned' | 'dismissed'): Promise<PatrolFinding | null> {
    const repo = acmDataSource.getRepository(PatrolFinding);
    await repo.update(id, { status });
    return repo.findOne({ where: { id } });
  }

  // ---------- 游标 ----------

  // 游标存 epoch 毫秒：datetime 字符串经 JS Date 解析随容器时区漂移，逐轮累计会撑大窗口
  private async resolveCursorFrom(now: Date): Promise<Date> {
    const values = await readRuntimeValues([SYSTEM_CONFIG_KEYS.patrolBgCursor]);
    const raw = values.get(SYSTEM_CONFIG_KEYS.patrolBgCursor);
    if (raw) {
      const cursor = new Date(Number(raw));
      if (!Number.isNaN(cursor.getTime()) && cursor.getTime() <= now.getTime()) return cursor;
    }
    return new Date(now.getTime() - DEFAULT_SCAN_WINDOW_HOURS * 3600_000);
  }

  private async writeCursor(at: Date): Promise<void> {
    try {
      await acmDataSource.getRepository(AcmSystemConfig).upsert(
        { configKey: SYSTEM_CONFIG_KEYS.patrolBgCursor, configValue: String(at.getTime()), isSecret: false, updatedBy: 'patrol-job' },
        { conflictPaths: ['configKey'] },
      );
    } catch (err) {
      logger.error(`[abuse-patrol] cursor write failed: ${(err as Error).message}`);
    }
  }
}

export const abusePatrolService = new AbusePatrolService();
