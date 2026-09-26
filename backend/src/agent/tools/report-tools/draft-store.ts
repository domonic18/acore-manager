import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WORKSPACE_ROOT } from '@/agent/tools/log-tools/log-workspace';
import {
  REPORT_SECTIONS,
  validateSection,
  type InspectionReportJson,
  type ReportSection,
  type SuspiciousPlayer,
} from './sections';

// 草稿目录（模块态注入，同 setInspectionRunner 模式；巡检进程串行 + inflight 去重）

const SECTION_FILE: Record<ReportSection, string> = {
  'server-health': 'server-health.json',
  'suspicious-players': 'suspicious-players.json',
  recommendations: 'recommendations.json',
};

let draftRoot: string | null = null;

export function reportDraftDir(realm: string, date: string): string {
  return join(WORKSPACE_ROOT, realm, date, '_draft');
}

export function setReportDraftRoot(dir: string): void {
  draftRoot = dir;
}

export function clearReportDraftRoot(): void {
  draftRoot = null;
}

export function resetDraftDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

function requireDraftRoot(): string {
  if (!draftRoot) throw new Error('报告草稿目录未就绪（write_report_section 仅限巡检任务内调用）');
  return draftRoot;
}

/** write_report_section 工具执行体：校验该节 → 落盘 {section}.json（已存在则整节覆盖）。校验失败抛错（经注册表转 {error} 交模型重写）。 */
export function writeReportSection(section: ReportSection, content: unknown): { ok: true; section: ReportSection; bytes: number } {
  const dir = requireDraftRoot();
  const verdict = validateSection(section, content);
  if (!verdict.ok) throw new Error(verdict.error);
  mkdirSync(dir, { recursive: true });
  const body = JSON.stringify(verdict.value, null, 2);
  writeFileSync(join(dir, SECTION_FILE[section]), body, 'utf8');
  return { ok: true, section, bytes: Buffer.byteLength(body) };
}

export interface DraftedSections {
  serverHealth?: InspectionReportJson['serverHealth'];
  suspiciousPlayers?: SuspiciousPlayer[];
  recommendations?: string[];
  missing: ReportSection[];
}

/** 读三节草稿（写入时已校验，此处再过一遍清洗保证入库数据干净），missing 列出未落盘节。 */
export function readDraftedSections(dir: string): DraftedSections {
  const result: DraftedSections = { missing: [] };
  for (const section of REPORT_SECTIONS) {
    const file = join(dir, SECTION_FILE[section]);
    if (!existsSync(file)) {
      result.missing.push(section);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`报告草稿 ${SECTION_FILE[section]} 不是合法 JSON：${(err as Error).message}`, { cause: err });
    }
    const verdict = validateSection(section, parsed);
    if (!verdict.ok) throw new Error(`报告草稿 ${SECTION_FILE[section]} 未通过校验：${verdict.error}`);
    if (section === 'server-health') result.serverHealth = verdict.value as InspectionReportJson['serverHealth'];
    else if (section === 'suspicious-players') result.suspiciousPlayers = verdict.value as SuspiciousPlayer[];
    else result.recommendations = verdict.value as string[];
  }
  return result;
}
