import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

// 提示词加载（文件为真源）：agent/prompts/{scene}.yaml，文档结构
// { description?, system, taskTemplate?, followups? }。提示词随代码走 dist（build 脚本拷贝 YAML），
// 场景缺失视为装配错误直接抛出；system 字段语义与旧版 loader 完全一致。
// 任务模板占位符 {{var}} 由 renderTemplate 渲染：缺失变量抛错（变量全在代码侧静态枚举，
// 单测兜住拼写漂移，防止静默把未渲染占位符发给模型）。mtime 感知缓存：查看页轮询/每轮渲染免重复 IO。

const PROMPTS_DIR = join(__dirname, '..', 'prompts');
const SKILLS_DIR = join(__dirname, '..', 'skills');

export interface PromptDoc {
  description?: string;
  system?: string;
  taskTemplate?: string;
  followups?: Record<string, string>;
}

export type PromptPartKey = 'taskTemplate' | `followups.${string}`;

interface CacheEntry {
  mtimeMs: number;
  doc: PromptDoc;
}

const cache = new Map<string, CacheEntry>();

function loadDoc(scene: string): { doc: PromptDoc; sourcePath: string; mtimeMs: number } {
  const file = join(PROMPTS_DIR, `${scene}.yaml`);
  if (!existsSync(file)) throw new Error(`prompt file not found: ${file}`);
  const mtimeMs = statSync(file).mtimeMs;
  const hit = cache.get(scene);
  if (hit && hit.mtimeMs === mtimeMs) return { doc: hit.doc, sourcePath: file, mtimeMs };
  const doc = (yaml.load(readFileSync(file, 'utf8')) ?? {}) as PromptDoc;
  cache.set(scene, { mtimeMs, doc });
  return { doc, sourcePath: file, mtimeMs };
}

export function loadPrompt(scene: string): string {
  const { doc } = loadDoc(scene);
  if (!doc?.system || typeof doc.system !== 'string') {
    throw new Error(`system prompt "${scene}.yaml" must contain a non-empty "system" field`);
  }
  return doc.system;
}

export function loadPromptPart(scene: string, key: PromptPartKey): string {
  const { doc } = loadDoc(scene);
  const value = key.startsWith('followups.') ? doc.followups?.[key.slice('followups.'.length)] : doc.taskTemplate;
  if (!value || typeof value !== 'string') {
    throw new Error(`prompt "${scene}.yaml" must contain a non-empty "${key}" field`);
  }
  return value;
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  const missing = new Set<string>();
  const rendered = template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    const value = vars[name];
    if (value === undefined) {
      missing.add(name);
      return '';
    }
    return value;
  });
  if (missing.size > 0) throw new Error(`template variables missing: ${[...missing].sort().join(', ')}`);
  return rendered;
}

// ---- 只读查看（ai-prompt 路由）：不做任何写路径，修改提示词走 git ----

const SECTION_LABELS: Record<string, string> = {
  system: '系统提示词',
  taskTemplate: '任务模板',
  'followups.jsonFix': 'JSON 校验修复追问',
  'followups.sectionSalvage': '缺节抢救追问',
};

export interface PromptSection {
  key: string;
  label: string;
  content: string;
}

export interface PromptDocSummary {
  scene: string;
  description: string;
  sections: PromptSection[];
  sourcePath: string;
  updatedAt: string;
}

export function listPromptDocs(): PromptDocSummary[] {
  const scenes = readdirSync(PROMPTS_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => f.replace(/\.yaml$/, ''))
    .sort();
  return scenes.map((scene) => {
    const { doc, mtimeMs } = loadDoc(scene);
    const sections: PromptSection[] = [];
    if (doc.system) sections.push({ key: 'system', label: SECTION_LABELS.system, content: doc.system });
    if (doc.taskTemplate) sections.push({ key: 'taskTemplate', label: SECTION_LABELS.taskTemplate, content: doc.taskTemplate });
    for (const [name, content] of Object.entries(doc.followups ?? {})) {
      if (typeof content !== 'string' || !content) continue;
      const key = `followups.${name}`;
      sections.push({ key, label: SECTION_LABELS[key] ?? name, content });
    }
    return {
      scene,
      description: typeof doc.description === 'string' ? doc.description : '',
      sections,
      sourcePath: `backend/src/agent/prompts/${scene}.yaml`,
      updatedAt: new Date(mtimeMs).toISOString(),
    };
  });
}

export interface SkillDocSummary {
  name: string;
  content: string;
}

export function listSkillDocs(): SkillDocSummary[] {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(SKILLS_DIR, e.name, 'SKILL.md')))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({ name: e.name, content: readFileSync(join(SKILLS_DIR, e.name, 'SKILL.md'), 'utf8') }));
}
