import 'reflect-metadata';
import '@/config/load-env';
import { execSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';
import { cosConfigured, cosGetObjectJson, cosPutObjectBuffer } from '@/shared/utils/cos.util';
import { yesterdayCST } from '@/shared/utils/cst-date.util';
import { logger } from '@/middleware/request-logger';

// T3.6 植入样例联调物料：生成含已知违规与"合法加速误报"的 anticheat 样例日志，
// 按 M1 规范上传 COS（acore-logs/{realm}/{date}/anticheat.tar.gz + manifest.json）。
// 样例设计（配合 ai_anticheat_exemption / character_aura 可分别触发 exemption / aura / latency 信号）：
//   A. Plagueknight（guid 99001）：speed×6 + fly×3 + waterwalk×2 + teleportplane×1，低延迟、跨地图 → 必检出
//   B. Mountedpal（guid 99002）：speed×3，平均延迟 >100ms → latency 信号拦截 ban；
//      若该 guid 在 character_aura 有 34859/32223（十字军光环）→ aura 信号拦截
// 用法：node dist/scripts/plant-inspection-samples.js --realm=realm3 --date=YYYY-MM-DD

interface SamplePlayer {
  name: string;
  guid: number;
  entries: Array<{ typeRaw: string; detail: string; latency: number; map: number }>;
}

const LOW = (guid: number) => guid.toString(16).padStart(8, '0');

function line(date: string, time: string, p: SamplePlayer, e: SamplePlayer['entries'][number]): string {
  const z = (p.guid % 97).toFixed(6);
  const o = (p.guid % 6).toFixed(6);
  return (
    `${date} ${time} INFO [anticheat.module] AnticheatMgr:: ${e.typeRaw} (${e.detail}) detected player ${p.name} ` +
    `(GUID Full: 0x${LOW(p.guid)} Type: Player Low: ${p.guid}) - Latency: ${e.latency} ms - IP: 192.168.65.1 ` +
    `- Cheat Flagged At: .go xyz -2${p.guid % 9}0.${z} 106${p.guid % 9}.${e.latency}.007812 55.583813 ${e.map} ${o}`
  );
}

function buildSampleLog(date: string): { content: string; players: SamplePlayer[] } {
  const cheater: SamplePlayer = {
    name: 'Plagueknight',
    guid: 99001,
    entries: [
      ...Array.from({ length: 6 }, (_, i) => ({
        typeRaw: 'Speed-Hack',
        detail: `Speed-Hack (${26 + i * 3}% above)`,
        latency: 28 + i * 4,
        map: i % 2 === 0 ? 0 : 530,
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        typeRaw: 'Fly-Hack',
        detail: `Fly-Hack (altitude ${10 + i * 5} yards above ground)`,
        latency: 33 + i * 5,
        map: 530,
      })),
      { typeRaw: 'Walk on Water - Hack', detail: 'Walk on Water - Hack detected', latency: 41, map: 0 },
      { typeRaw: 'Walk on Water - Hack', detail: 'Walk on Water - Hack detected', latency: 45, map: 0 },
      { typeRaw: 'Teleport to Plane', detail: 'Teleport to Plane (z delta 210.5)', latency: 52, map: 0 },
    ],
  };
  const mounted: SamplePlayer = {
    name: 'Mountedpal',
    guid: 99002,
    entries: [
      { typeRaw: 'Speed-Hack', detail: 'Speed-Hack (19% above)', latency: 118, map: 0 },
      { typeRaw: 'Speed-Hack', detail: 'Speed-Hack (24% above)', latency: 145, map: 0 },
      { typeRaw: 'Speed-Hack', detail: 'Speed-Hack (21% above)', latency: 132, map: 0 },
    ],
  };
  const players = [cheater, mounted];
  let hh = 9;
  let mm = 0;
  const lines: string[] = [];
  for (const p of players) {
    for (const e of p.entries) {
      lines.push(line(date, `${String(hh).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}:1${mm % 10}`, p, e));
      hh += mm === 55 ? 1 : 0;
      mm = (mm + 7) % 60;
    }
  }
  return { content: lines.join('\n') + '\n', players };
}

function parseArgs(argv: string[]): { realm: string; date: string } {
  let realm: string | undefined;
  let date: string | undefined;
  for (const arg of argv) {
    if (arg.startsWith('--realm=')) realm = arg.slice(8).trim();
    else if (arg.startsWith('--date=')) date = arg.slice(7).trim();
    else throw new Error(`未知参数 ${arg}（支持 --realm= --date=YYYY-MM-DD）`);
  }
  if (!realm) throw new Error('缺少必填参数 --realm=<realm>');
  const finalDate = date ?? yesterdayCST();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(finalDate)) throw new Error(`--date 需为 YYYY-MM-DD，收到 ${finalDate}`);
  return { realm, date: finalDate };
}

async function main(): Promise<void> {
  const { realm, date } = parseArgs(process.argv.slice(2));
  if (!cosConfigured()) {
    console.error('COS 未配置，中止');
    process.exit(1);
  }

  const { content, players } = buildSampleLog(date);
  const workDir = mkdtempSync(join(tmpdir(), 'acm-plant-'));
  const logName = `anticheat_${date}.log`;
  writeFileSync(join(workDir, logName), content);
  execSync(`tar -czf ${JSON.stringify(join(workDir, 'anticheat.tar.gz'))} -C ${JSON.stringify(workDir)} ${logName}`);
  const buf = readFileSync(join(workDir, 'anticheat.tar.gz'));
  const md5 = createHash('md5').update(buf).digest('hex');
  const lines = content.split('\n').filter((l) => l.trim().length > 0).length;

  const archiveKey = `acore-logs/${realm}/${date}/anticheat.tar.gz`;
  await cosPutObjectBuffer(archiveKey, buf, 'application/gzip');
  const manifest = {
    realm,
    date,
    generatedAt: new Date().toISOString(),
    files: [{ type: 'anticheat', file: 'anticheat.tar.gz', size: buf.length, md5, lines }],
  };
  await cosPutObjectBuffer(`acore-logs/${realm}/${date}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');
  rmSync(workDir, { recursive: true, force: true });

  const roundTrip = await cosGetObjectJson(`acore-logs/${realm}/${date}/manifest.json`);
  console.log('[planted]', JSON.stringify({ realm, date, archiveKey, bytes: buf.length, md5, lines, roundTrip: Boolean(roundTrip) }));
  for (const p of players) {
    console.log(`  sample ${p.name} guid=${p.guid} entries=${p.entries.length}`);
  }
  console.log('[next] 触发巡检后验证：A 检出且附证据；B falsePositiveSignals 非空且建议≠ban');
}

main().catch((err) => {
  logger.error(`[plant-samples] ${(err as Error).message}`);
  process.exit(1);
});
