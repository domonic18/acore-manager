jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  const state = { mtimeOverride: null as number | null };
  const readFileSync = jest.fn((...args: Parameters<typeof actual.readFileSync>) => actual.readFileSync(...args));
  (globalThis as unknown as { __fsTestState: typeof state; __fsTestReadFile: typeof readFileSync }).__fsTestState = state;
  (globalThis as unknown as { __fsTestReadFile: typeof readFileSync }).__fsTestReadFile = readFileSync;
  return {
    ...actual,
    readFileSync,
    statSync: (...args: Parameters<typeof actual.statSync>) => {
      const stats = actual.statSync(...args);
      return state.mtimeOverride === null ? stats : Object.assign(stats, { mtimeMs: state.mtimeOverride });
    },
  };
});

import {
  listPromptDocs,
  listSkillDocs,
  loadPrompt,
  loadPromptPart,
  renderTemplate,
} from '@/agent/core/prompt-loader';

const testState = () => (globalThis as unknown as { __fsTestState: { mtimeOverride: number | null } }).__fsTestState;
const testReadFile = () => (globalThis as unknown as { __fsTestReadFile: jest.Mock }).__fsTestReadFile;

describe('renderTemplate', () => {
  it('replaces all placeholders and preserves surrounding text', () => {
    expect(renderTemplate('A {{x}} B {{y}} {{x}}', { x: '1', y: '2' })).toBe('A 1 B 2 1');
  });

  it('throws listing missing variable names in sorted order', () => {
    expect(() => renderTemplate('{{c}} {{a}}', { b: '1' })).toThrow('template variables missing: a, c');
  });

  it('treats empty string as a provided value', () => {
    expect(renderTemplate('{{v}}', { v: '' })).toBe('');
  });
});

describe('loadPrompt / loadPromptPart', () => {
  afterEach(() => {
    testState().mtimeOverride = null;
  });

  it('returns the system prompt of a real scene', () => {
    expect(loadPrompt('assistant')).toContain('助手');
  });

  it('returns raw template parts with placeholders intact', () => {
    expect(loadPromptPart('inspection', 'taskTemplate')).toContain('{{realm}}');
    expect(loadPromptPart('inspection', 'followups.jsonFix')).toContain('{{issues}}');
    expect(loadPromptPart('inspection', 'followups.sectionSalvage')).toContain('{{missing}}');
  });

  it('throws on a missing part or scene', () => {
    expect(() => loadPromptPart('assistant', 'taskTemplate')).toThrow(/must contain a non-empty "taskTemplate"/);
    expect(() => loadPromptPart('assistant', 'followups.nope')).toThrow(/followups\.nope/);
    expect(() => loadPrompt('no-such-scene')).toThrow(/prompt file not found/);
  });
});

describe('mtime-aware cache', () => {
  afterEach(() => {
    testState().mtimeOverride = null;
  });

  it('re-reads a scene file when its mtime changes and hits the cache otherwise', () => {
    const readFile = testReadFile();
    testState().mtimeOverride = 1000;
    readFile.mockClear();
    const first = loadPrompt('assistant');
    expect(readFile.mock.calls.length).toBeGreaterThan(0);

    readFile.mockClear();
    expect(loadPrompt('assistant')).toBe(first);
    expect(readFile.mock.calls.length).toBe(0);

    testState().mtimeOverride = 2000;
    readFile.mockClear();
    expect(loadPrompt('assistant')).toBe(first);
    expect(readFile.mock.calls.length).toBeGreaterThan(0);
  });
});

describe('listPromptDocs (只读查看契约)', () => {
  beforeAll(() => {
    testState().mtimeOverride = null;
  });

  it('lists all scenes sorted with description/sections/sourcePath/updatedAt', () => {
    const docs = listPromptDocs();
    const scenes = docs.map((d) => d.scene);
    expect(scenes).toEqual([...scenes].sort());
    expect(scenes).toEqual(expect.arrayContaining(['analysis', 'assistant', 'inspection']));

    const inspection = docs.find((d) => d.scene === 'inspection')!;
    expect(inspection.description).toContain('巡检');
    expect(inspection.sections.map((s) => s.key)).toEqual(['system', 'taskTemplate', 'followups.jsonFix', 'followups.sectionSalvage']);
    expect(inspection.sections.map((s) => s.label)).toEqual(['系统提示词', '任务模板', 'JSON 校验修复追问', '缺节抢救追问']);
    expect(inspection.sourcePath).toBe('backend/src/agent/prompts/inspection.yaml');
    expect(inspection.updatedAt).toBeTruthy();
  });

  it('keeps submit-tool contract anchors in inspection/analysis docs (防契约漂移)', () => {
    const docs = listPromptDocs();
    const inspection = docs.find((d) => d.scene === 'inspection')!;
    expect(inspection.sections.find((s) => s.key === 'system')!.content).toContain('submit_final_report');
    expect(inspection.sections.find((s) => s.key === 'taskTemplate')!.content).toContain('submit_final_report');
    const analysis = docs.find((d) => d.scene === 'analysis')!;
    expect(analysis.sections.find((s) => s.key === 'system')!.content).toContain('submit_conclusion');
    expect(analysis.sections.find((s) => s.key === 'taskTemplate')!.content).toContain('submit_conclusion');
  });
});

describe('listSkillDocs', () => {
  it('reads skill docs from agent/skills with non-empty content', () => {
    const skills = listSkillDocs();
    expect(skills.length).toBeGreaterThan(0);
    for (const s of skills) {
      expect(s.name).toBeTruthy();
      expect(s.content.length).toBeGreaterThan(0);
    }
  });
});
