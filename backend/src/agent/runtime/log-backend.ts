import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { createReadStream } from 'fs';
import { lstat, open, readdir, stat } from 'fs/promises';
import { basename, dirname, join, relative, sep } from 'path';
import { createInterface } from 'readline';
import {
  applyGrepMaxCount,
  FilesystemBackend,
  normalizeReadPagination,
  type GrepMatch,
  type GrepResult,
  type ReadResult,
} from 'deepagents';

// 日志工作区专用后端（OOM 治本，2026-10-22 SCF job 439 事故）：
// 上游 FilesystemBackend.read 是"整文件读入再 split 全量行数组"（内存 O(文件大小)），
// grep 的 ripgrep 路径全量累积 stdout、literal 回退静默跳过 >10MB 文件——数百 MB 的
// Server 日志一次 read_file 即可打穿 ~512MB 堆。本子类覆写 read/grep，使任意文件访问
// 内存 O(读取窗口)；超限返回 truncated 标记而非抛错，模型可据此收窄检索。其余方法
// （ls/glob/write/edit）不覆写：readdir 级操作本就内存安全，写权限由 permissions 全局 deny。
// deepagents 工具层经 adaptBackendProtocol 动态委托到本实例，子类覆写必然生效。

// 小文件直接走父类原生路径（mime/binary/空文件/symlink 语义与上游完全一致）
const READ_FAST_PATH_BYTES = 8 * 1024 * 1024;
// 单行截断上限：防 crash dump / 无换行 JSON 单行数 MB
const MAX_LINE_CHARS = 16_000;
const MAX_LINE_SUFFIX = '…[line truncated]';
const GREP_DEFAULT_MAX_MATCHES = 200;
const GREP_MAX_OUTPUT_BYTES = 1024 * 1024;
const GREP_TIMEOUT_MS = 30_000;
const MAX_BINARY_READ_BYTES = 10 * 1024 * 1024;
const BINARY_SNIFF_BYTES = 8192;

// 测试缝隙：指向不存在的二进制可强制走 JS 流式扫描回退路径
const RG_BIN = () => process.env.ACM_RG_BIN || 'rg';

type PathResolver = { resolvePath(key: string): string };

export class LogWorkspaceBackend extends FilesystemBackend {
  private resolveWorkspacePath(key: string): string {
    // resolvePath 在上游声明为 private（路径穿越安全边界），经受控通道复用而非重写
    return (this as unknown as PathResolver).resolvePath(key);
  }

  private toVirtualPath(full: string): string | null {
    if (!this.virtualMode) return full;
    const rel = relative(this.cwd, full);
    if (rel.startsWith('..')) return null;
    return `/${rel.split(sep).join('/')}`;
  }

  override async read(filePath: string, offset = 0, limit = 500): Promise<ReadResult> {
    let resolved: string;
    try {
      resolved = this.resolveWorkspacePath(filePath);
      const st = await lstat(resolved);
      if (st.isSymbolicLink()) return { error: `Symlinks are not allowed: ${filePath}` };
      if (!st.isFile()) return { error: `File '${filePath}' not found` };
      if (st.size <= READ_FAST_PATH_BYTES) return super.read(filePath, offset, limit);
      if (await isBinaryFile(resolved)) {
        return {
          error: `binary file '${filePath}' (${mb(st.size)}MB) exceeds ${mb(MAX_BINARY_READ_BYTES)}MB binary read limit; use grep or the parse_* tools instead`,
        };
      }
    } catch (err) {
      return { error: `Error reading file '${filePath}': ${(err as Error).message}` };
    }

    const { offset: lineOffset, limit: lineLimit } = normalizeReadPagination(offset, limit);
    try {
      const input = createReadStream(resolved, { encoding: 'utf8' });
      const rl = createInterface({ input, crlfDelay: Infinity });
      const lines: string[] = [];
      let seen = 0;
      let hasMore = false;
      for await (const line of rl) {
        seen++;
        if (seen <= lineOffset) continue;
        if (lines.length < lineLimit) {
          lines.push(truncateLine(line));
          continue;
        }
        hasMore = true;
        break;
      }
      if (lines.length === 0 && !hasMore && lineOffset >= seen) {
        return { error: `Line offset ${lineOffset} exceeds file length (${seen} lines)` };
      }
      if (lines.length === 0 || lineLimit === 0) return { content: lines.join('\n') };
      return {
        content: lines.join('\n'),
        startLine: lineOffset + 1,
        endLine: lineOffset + lines.length,
        ...(hasMore ? { nextOffset: lineOffset + lineLimit } : {}),
      };
    } catch (err) {
      return { error: `Error reading file '${filePath}': ${(err as Error).message}` };
    }
  }

  override async grep(pattern: string, dirPath = '/', glob: string | null = null, maxCount: number | null = null): Promise<GrepResult> {
    const cap = maxCount && maxCount > 0 ? maxCount : GREP_DEFAULT_MAX_MATCHES;
    let baseFull: string;
    try {
      baseFull = this.resolveWorkspacePath(dirPath || '.');
    } catch {
      return { matches: [] };
    }
    try {
      await stat(baseFull);
    } catch {
      return { matches: [] };
    }
    const viaRg = await this.grepWithRipgrep(pattern, baseFull, glob, cap);
    const result = viaRg ?? (await this.grepByStreamingScan(pattern, baseFull, glob, cap));
    return applyGrepMaxCount({ result, maxCount });
  }

  /** rg 路径：逐行增量解析 --json 输出，达上限/超时即终止子进程并标 truncated（内存 O(cap)） */
  private grepWithRipgrep(pattern: string, baseFull: string, glob: string | null, cap: number): Promise<GrepResult | null> {
    return new Promise((resolve) => {
      const args = ['--json', '-F', '--max-columns', '1000', '--max-columns-preview'];
      if (glob) args.push('--glob', glob);
      args.push('--', pattern, baseFull);
      let proc: ChildProcessWithoutNullStreams;
      try {
        proc = spawn(RG_BIN(), args);
      } catch {
        resolve(null);
        return;
      }
      const matches: GrepMatch[] = [];
      let truncated = false;
      let bytes = 0;
      let timedOut = false;
      let stopping = false;
      const timer = setTimeout(() => {
        timedOut = true;
        stopping = true;
        proc.kill('SIGKILL');
      }, GREP_TIMEOUT_MS);
      const rl = createInterface({ input: proc.stdout });
      rl.on('line', (raw) => {
        bytes += raw.length;
        if (stopping) return;
        if (bytes > GREP_MAX_OUTPUT_BYTES) {
          truncated = true;
          stopping = true;
          proc.kill('SIGTERM');
          return;
        }
        let data: {
          type?: string;
          data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } };
        };
        try {
          data = JSON.parse(raw);
        } catch {
          return;
        }
        if (data.type !== 'match') return;
        if (matches.length >= cap) {
          // 精确 truncated 语义：cap 条之后又出现新命中才截断
          truncated = true;
          stopping = true;
          proc.kill('SIGTERM');
          return;
        }
        const ftext = data.data?.path?.text;
        const ln = data.data?.line_number;
        if (!ftext || ln === undefined) return;
        const vpath = this.toVirtualPath(ftext);
        if (!vpath) return;
        matches.push({ path: vpath, line: ln, text: data.data?.lines?.text?.replace(/\n$/, '') ?? '' });
      });
      proc.on('error', () => {
        // rg 不可用（容器未装/PATH 缺失）→ 回退 JS 流式扫描
        clearTimeout(timer);
        rl.close();
        resolve(null);
      });
      proc.on('close', (code) => {
        clearTimeout(timer);
        rl.close();
        if (truncated || timedOut) {
          resolve({ matches, truncated: true });
          return;
        }
        if (code !== 0 && code !== 1) {
          resolve(null);
          return;
        }
        resolve({ matches });
      });
    });
  }

  /** JS 回退：readline 流式逐行 literal 扫描。与上游 literalSearch 的差别——不跳过 >10MB 文件，全程有上限 */
  private async grepByStreamingScan(pattern: string, baseFull: string, glob: string | null, cap: number): Promise<GrepResult> {
    const matches: GrepMatch[] = [];
    let truncated = false;
    const root = (await stat(baseFull)).isDirectory() ? baseFull : dirname(baseFull);
    const files = await listFilesRecursive(root);
    const nameRe = glob ? globToRegExp(glob) : null;
    outer: for (const fp of files) {
      if (nameRe && !nameRe.test(basename(fp))) continue;
      if (await isBinaryFile(fp)) continue;
      const vpath = this.toVirtualPath(fp);
      if (!vpath) continue;
      const input = createReadStream(fp, { encoding: 'utf8' });
      const rl = createInterface({ input, crlfDelay: Infinity });
      let lineNo = 0;
      for await (const line of rl) {
        lineNo++;
        if (!line.includes(pattern)) continue;
        if (matches.length >= cap) {
          truncated = true;
          break outer;
        }
        matches.push({ path: vpath, line: lineNo, text: truncateLine(line) });
      }
    }
    return { matches, truncated };
  }
}

function truncateLine(line: string): string {
  return line.length > MAX_LINE_CHARS ? line.slice(0, MAX_LINE_CHARS) + MAX_LINE_SUFFIX : line;
}

function mb(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

/** 首 8KB 嗅探 NUL 字节判定二进制（标准 text-detection 启发式） */
async function isBinaryFile(full: string): Promise<boolean> {
  const fd = await open(full, 'r');
  try {
    const buf = Buffer.alloc(BINARY_SNIFF_BYTES);
    const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
    return buf.subarray(0, bytesRead).includes(0);
  } finally {
    await fd.close();
  }
}

async function listFilesRecursive(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) out.push(full);
    }
  };
  await walk(root);
  return out.sort();
}

/** 工作区检索只需 basename 级 glob（如 *.log）：支持 * 与 ? */
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}
