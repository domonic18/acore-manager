import { execSync } from 'child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { performance } from 'perf_hooks';

// T0.2 SCF Job 形态验证桩（M0 专用，docker/Dockerfile.job 镜像 CMD 直接执行，一次性运行后退出）。
// 流程：下载/生成 fixture tar.gz → /tmp 解压 → 扫描 → 输出耗时与内存 JSON。
// 目的：验证 SCF 容器对 /tmp 写入、子进程 tar、网络出站的限制与配额。

interface JobReport {
  mode: 'remote-fixture' | 'synthetic-fixture';
  downloadMs: number;
  downloadBytes: number;
  extractMs: number;
  scanMs: number;
  files: number;
  bytes: number;
  matchedLines: number;
  totalMs: number;
  memoryRssMB: number;
  memoryHeapUsedMB: number;
}

function walk(dir: string, visit: (file: string) => void): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else visit(full);
  }
}

async function downloadFixture(url: string, target: string): Promise<number> {
  const t0 = performance.now();
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fixture download failed: HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  writeFileSync(target, buf);
  return performance.now() - t0;
}

function buildSyntheticFixture(target: string): number {
  const t0 = performance.now();
  const dir = mkdtempSync('/tmp/fixture-src-');
  for (let i = 0; i < 20; i += 1) {
    const lines = Array.from({ length: 500 }, (_, n) =>
      n % 10 === 0 ? `ERROR antifarm suspicious move map=0 guid=${i * 100 + n}` : `INFO tick ${n}`,
    );
    writeFileSync(join(dir, `worldserver-${i}.log`), lines.join('\n'));
  }
  execSync(`tar -czf ${JSON.stringify(target)} -C ${JSON.stringify(dir)} .`, { stdio: 'ignore' });
  rmSync(dir, { recursive: true, force: true });
  return performance.now() - t0;
}

async function main(): Promise<void> {
  const t0 = performance.now();
  const workDir = mkdtempSync('/tmp/acm-job-');
  const tgzPath = join(workDir, 'fixture.tar.gz');
  const extractDir = join(workDir, 'extracted');

  let mode: JobReport['mode'];
  let downloadMs: number;
  try {
    const url = process.env.JOB_FIXTURE_URL;
    if (url) {
      downloadMs = await downloadFixture(url, tgzPath);
      mode = 'remote-fixture';
    } else {
      downloadMs = buildSyntheticFixture(tgzPath);
      mode = 'synthetic-fixture';
    }
  } catch (err) {
    console.error(JSON.stringify({ fatal: 'fixture-prep', message: (err as Error).message }));
    process.exit(1);
  }

  const downloadBytes = statSync(tgzPath).size;
  const t1 = performance.now();
  execSync(`mkdir -p ${JSON.stringify(extractDir)} && tar -xzf ${JSON.stringify(tgzPath)} -C ${JSON.stringify(extractDir)}`, {
    stdio: 'ignore',
  });
  const extractMs = performance.now() - t1;

  let files = 0;
  let bytes = 0;
  let matchedLines = 0;
  const t2 = performance.now();
  walk(extractDir, (file) => {
    files += 1;
    const content = readFileSync(file, 'utf8');
    bytes += content.length;
    for (const line of content.split('\n')) if (/error|warn/i.test(line)) matchedLines += 1;
  });
  const scanMs = performance.now() - t2;

  const mem = process.memoryUsage();
  const report: JobReport = {
    mode: mode!,
    downloadMs: Math.round(downloadMs),
    downloadBytes,
    extractMs: Math.round(extractMs),
    scanMs: Math.round(scanMs),
    files,
    bytes,
    matchedLines,
    totalMs: Math.round(performance.now() - t0),
    memoryRssMB: Math.round(mem.rss / 1024 / 1024),
    memoryHeapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
  };
  console.log(JSON.stringify(report, null, 2));
  rmSync(workDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error('inspection job failed:', err?.message ?? err);
  process.exit(1);
});
