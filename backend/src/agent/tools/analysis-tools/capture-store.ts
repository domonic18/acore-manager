import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AnalysisConclusionShapeSchema, analysisConclusionSchema, type AnalysisConclusionData, type ConclusionSubject } from './conclusion-schema';

// 结论捕获目录（模块态注入，同 report-tools/draft-store 模式；定向分析任务进程内串行）：
// submit_conclusion 工具执行体把结论落盘为 conclusion.json，服务层读回后走 echo 等值复验。

const CONCLUSION_FILE = 'conclusion.json';

let captureRoot: string | null = null;

export function setConclusionCaptureRoot(dir: string): void {
  captureRoot = dir;
}

export function clearConclusionCaptureRoot(): void {
  captureRoot = null;
}

function requireCaptureRoot(): string {
  if (!captureRoot) throw new Error('结论捕获目录未就绪（submit_conclusion 仅限定向分析任务内调用）');
  return captureRoot;
}

/** submit_conclusion 工具执行体：形状校验 → 落盘 conclusion.json（已存在则覆盖）。校验失败抛错（经注册表转 {error} 交模型重写）。 */
export function writeConclusionCapture(raw: unknown): { ok: true; bytes: number } {
  const dir = requireCaptureRoot();
  const verdict = AnalysisConclusionShapeSchema.safeParse(raw);
  if (!verdict.success) {
    // 错误信息必须可操作（同 write_report_section 模式）：逐字段定位 + 「同工具重试」指引
    const issues = [...new Set(verdict.error.issues.map((i) => i.message))].join('；');
    throw new Error(`submit_conclusion 校验失败：${issues}。请修正参数后重新调用本工具重试；禁止放弃提交改为文本输出。`);
  }
  mkdirSync(dir, { recursive: true });
  const body = JSON.stringify(verdict.data, null, 2);
  writeFileSync(join(dir, CONCLUSION_FILE), body, 'utf8');
  return { ok: true, bytes: Buffer.byteLength(body) };
}

/** 读回捕获结论并做 subject 回显等值复验：文件缺失返回 {null, ''}（未提交），校验失败返回问题清单。 */
export function readConclusionCapture(dir: string, subject: ConclusionSubject): { conclusion: AnalysisConclusionData | null; issues: string } {
  const file = join(dir, CONCLUSION_FILE);
  if (!existsSync(file)) return { conclusion: null, issues: '' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    return { conclusion: null, issues: `捕获的结论文件不是合法 JSON：${(err as Error).message}` };
  }
  const verdict = analysisConclusionSchema(subject).safeParse(parsed);
  if (!verdict.success) {
    return { conclusion: null, issues: [...new Set(verdict.error.issues.map((i) => i.message))].join('；') };
  }
  return { conclusion: verdict.data, issues: '' };
}
