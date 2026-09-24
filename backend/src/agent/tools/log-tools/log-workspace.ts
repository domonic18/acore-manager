import { execFile } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join, relative } from 'path';
import { promisify } from 'util';

// 日志检索工作区（需求 3.5）：/tmp/ai-workspace/{realm}/{date}/{type}/
// 同一任务的多次工具调用共享（fetch 解压一次，parse/grep 直接读）；任务结束由编排层 finally 调 clearWorkspace()。

export const WORKSPACE_ROOT = join(tmpdir(), 'ai-workspace');
export const LOG_TYPES = ['worldserver', 'authserver', 'anticheat', 'crash'] as const;
export type LogType = (typeof LOG_TYPES)[number];

const execFileAsync = promisify(execFile);
const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024; // T0.2 SCF /tmp 上限未回填前先按 200MB 卡口

export function logArchiveKey(realm: string, date: string, type: LogType): string {
  return `acore-logs/${realm}/${date}/${type}.tar.gz`;
}

export function manifestKey(realm: string, date: string): string {
  return `acore-logs/${realm}/${date}/manifest.json`;
}

export function workspaceDir(realm: string, date: string, type: LogType): string {
  return join(WORKSPACE_ROOT, realm, date, type);
}

export function isLogType(value: string): value is LogType {
  return (LOG_TYPES as readonly string[]).includes(value);
}

export interface ExtractedFile {
  path: string;
  lines: number;
}

export async function extractArchive(realm: string, date: string, type: LogType, archive: Buffer): Promise<ExtractedFile[]> {
  if (archive.length > MAX_ARCHIVE_BYTES) {
    throw new Error(`archive ${type}.tar.gz exceeds ${MAX_ARCHIVE_BYTES} bytes limit`);
  }
  const dir = workspaceDir(realm, date, type);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const tmp = join(mkdtempSync(join(tmpdir(), 'ai-fetch-')), `${type}.tar.gz`);
  try {
    await writeFile(tmp, archive);
    await execFileAsync('tar', ['-xzf', tmp, '-C', dir], { timeout: 60_000 });
  } finally {
    rmSync(dirname(tmp), { recursive: true, force: true });
  }
  return listExtracted(dir);
}

export function listExtracted(dir: string): ExtractedFile[] {
  if (!existsSync(dir)) return [];
  const files: ExtractedFile[] = [];
  const walk = (cur: string): void => {
    for (const name of readdirSync(cur)) {
      const full = join(cur, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        files.push({ path: relative(dir, full), lines: countLines(full) });
      }
    }
  };
  walk(dir);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function readExtractedFile(dir: string, relPath: string): string {
  const full = join(dir, relPath);
  if (!full.startsWith(dir) || !existsSync(full) || statSync(full).isDirectory()) {
    throw new Error(`file not found in workspace: ${relPath}`);
  }
  return readFileSync(full, 'utf8');
}

export function countLines(file: string): number {
  const buf = readFileSync(file);
  let n = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] === 10) n++;
  return buf.length > 0 && buf[buf.length - 1] !== 10 ? n + 1 : n;
}

/** 任务结束清理整个工作区（巡检 Job / 会话编排 finally 调用） */
export function clearWorkspace(): void {
  rmSync(WORKSPACE_ROOT, { recursive: true, force: true });
}
