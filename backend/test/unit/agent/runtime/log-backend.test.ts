import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LogWorkspaceBackend } from '@/agent/runtime/log-backend';

// OOM 治本回归（2026-10-22 SCF job 439）：大日志的 read/grep 必须 O(读取窗口) 内存且语义对齐上游——
// read 窗口/翻页/超长行截断；grep 不静默跳过 >10MB 文件、达上限标 truncated 而非进程死亡。

const MAX_LINE_CHARS = 16_000;

function makeBackend(): { backend: LogWorkspaceBackend; root: string } {
  const root = mkdtempSync(join(tmpdir(), 'acm-log-backend-'));
  return { backend: new LogWorkspaceBackend({ rootDir: root, virtualMode: true }), root };
}

/** 生成 >8MB（越过 READ_FAST_PATH_BYTES）的已知行集文件 */
function writeBigLog(root: string, name: string, lineCount: number): string {
  const content = Array.from({ length: lineCount }, (_, i) => `line-${String(i).padStart(7, '0')} ${'x'.repeat(385)}`).join('\n');
  const full = join(root, name);
  writeFileSync(full, content + '\n');
  return full;
}

const hasSystemRg = (() => {
  try {
    execSync('rg --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('LogWorkspaceBackend.read', () => {
  let root: string;
  let backend: LogWorkspaceBackend;
  const savedRg = process.env.ACM_RG_BIN;

  beforeEach(() => {
    ({ backend, root } = makeBackend());
    delete process.env.ACM_RG_BIN;
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    if (savedRg === undefined) delete process.env.ACM_RG_BIN;
    else process.env.ACM_RG_BIN = savedRg;
  });

  it('small files take the parent fast path with upstream semantics', async () => {
    writeFileSync(join(root, 'small.log'), 'a\nb\nc\n');
    const r = await backend.read('/small.log');
    expect(r.error).toBeUndefined();
    expect(r.content).toBe('a\nb\nc\n');
    expect(r.startLine).toBe(1);
    expect(r.endLine).toBe(3);
    expect(typeof r.totalLines).toBe('number');
  });

  it('large files stream a bounded line window with pagination metadata', async () => {
    writeBigLog(root, 'big.log', 30_000);
    const first = await backend.read('/big.log');
    expect(first.error).toBeUndefined();
    const firstLines = (first.content as string).split('\n');
    expect(firstLines).toHaveLength(500);
    expect(firstLines[0]).toMatch(/^line-0000000 /);
    expect(first).toMatchObject({ startLine: 1, endLine: 500, nextOffset: 500 });

    const second = await backend.read('/big.log', 500, 500);
    expect((second.content as string).split('\n')[0]).toMatch(/^line-0000500 /);
    expect(second).toMatchObject({ startLine: 501, endLine: 1000, nextOffset: 1000 });

    // 末窗：流自然结束 → 无 nextOffset
    const last = await backend.read('/big.log', 29_900, 500);
    expect(last).toMatchObject({ startLine: 29_901, endLine: 30_000 });
    expect(last.nextOffset).toBeUndefined();

    // offset 超出文件长度 → 上游同款错误语义
    const beyond = await backend.read('/big.log', 30_000, 500);
    expect(String(beyond.error)).toContain('exceeds file length');
  });

  it('truncates pathological single lines instead of buffering them whole', async () => {
    writeFileSync(join(root, 'one-line.log'), `${'x'.repeat(9 * 1024 * 1024)}\ntail\n`);
    const r = await backend.read('/one-line.log');
    expect(r.error).toBeUndefined();
    const lines = (r.content as string).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveLength(MAX_LINE_CHARS + '…[line truncated]'.length);
    expect(lines[0].endsWith('[line truncated]')).toBe(true);
    expect(lines[1]).toBe('tail');
    expect(r.nextOffset).toBeUndefined();
  });

  it('rejects path traversal and missing files with upstream error shapes', async () => {
    const escaped = await backend.read('/../../../etc/passwd');
    expect(typeof escaped.error).toBe('string');
    const missing = await backend.read('/nope.log');
    expect(String(missing.error)).toContain('ENOENT');
  });
});

describe('LogWorkspaceBackend.grep', () => {
  let root: string;
  let backend: LogWorkspaceBackend;
  const savedRg = process.env.ACM_RG_BIN;

  beforeEach(() => {
    ({ backend, root } = makeBackend());
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    if (savedRg === undefined) delete process.env.ACM_RG_BIN;
    else process.env.ACM_RG_BIN = savedRg;
  });

  /** 12MB 文件埋 250 处 needle——覆盖上游 literalSearch 静默跳过 >10MB 的回归点 */
  function seedNeedles(name: string, needleCount: number): void {
    const lines = Array.from({ length: 30_000 }, (_, i) => (i < needleCount ? `NEEDLE hit-${i}` : `noise-${i} ${'z'.repeat(385)}`));
    writeFileSync(join(root, name), lines.join('\n') + '\n');
  }

  it('literal fallback scans files over 10MB instead of silently skipping them', async () => {
    process.env.ACM_RG_BIN = '/nonexistent/acm-rg';
    seedNeedles('big.log', 3);
    const r = await backend.grep('NEEDLE', '/');
    expect(r.truncated).toBeFalsy();
    expect(r.matches).toHaveLength(3);
    expect(r.matches?.map((m) => m.path)).toEqual(['/big.log', '/big.log', '/big.log']);
    expect(r.matches?.map((m) => m.line)).toEqual([1, 2, 3]);
    expect(r.matches?.[0].text).toBe('NEEDLE hit-0');
  });

  (hasSystemRg ? it : it.skip)('ripgrep path yields the same hits with virtual paths', async () => {
    delete process.env.ACM_RG_BIN;
    seedNeedles('big.log', 3);
    const r = await backend.grep('NEEDLE', '/');
    expect(r.matches).toHaveLength(3);
    expect(r.matches?.every((m) => m.path === '/big.log')).toBe(true);
  });

  it('flags truncated instead of dying when the default match cap is hit', async () => {
    process.env.ACM_RG_BIN = '/nonexistent/acm-rg';
    seedNeedles('big.log', 250);
    const r = await backend.grep('NEEDLE', '/');
    expect(r.matches).toHaveLength(200);
    expect(r.truncated).toBe(true);
  });

  it('honours maxCount and reports truncation beyond it', async () => {
    process.env.ACM_RG_BIN = '/nonexistent/acm-rg';
    seedNeedles('big.log', 250);
    const r = await backend.grep('NEEDLE', '/', null, 3);
    expect(r.matches).toHaveLength(3);
    expect(r.truncated).toBe(true);
  });

  it('skips binary files and glob-filters by basename in fallback mode', async () => {
    process.env.ACM_RG_BIN = '/nonexistent/acm-rg';
    writeFileSync(join(root, 'text.log'), 'NEEDLE here\n');
    writeFileSync(join(root, 'dump.bin'), Buffer.concat([Buffer.from([0, 1, 2, 0]), Buffer.from('NEEDLE\n')]));
    const r = await backend.grep('NEEDLE', '/', '*.log');
    expect(r.matches).toEqual([{ path: '/text.log', line: 1, text: 'NEEDLE here' }]);
  });

  it('returns empty matches for out-of-root paths', async () => {
    const r = await backend.grep('x', '/../../etc');
    expect(r.matches).toEqual([]);
  });
});
