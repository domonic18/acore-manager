jest.mock('@/config/env', () => ({
  env: { AI_AGENT_CACHE_SIZE: 4, AI_TOOL_CALL_BUDGET: 20, AI_TOOL_TIMEOUT_MS: 5000, LOG_LEVEL: 'silent', NODE_ENV: 'test' },
}));
jest.mock('@/config/database', () => ({
  authDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  charactersDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  worldDataSource: { isInitialized: true, query: jest.fn().mockResolvedValue([]) },
  acmDataSource: { getRepository: jest.fn(() => ({ insert: jest.fn().mockResolvedValue({}) })) },
}));
jest.mock('@/shared/utils/cos.util', () => ({
  cosConfigured: jest.fn(() => false),
  cosGetObjectBuffer: jest.fn(),
  cosGetObjectJson: jest.fn(),
  cosPutObjectBuffer: jest.fn(),
}));
jest.mock('@/agent/runtime/checkpointer', () => ({
  getCheckpointer: jest.fn().mockResolvedValue({}),
}));
jest.mock('@/agent/runtime/model-factory', () => ({
  // getName 为 deepagents 构造期探测提供方所用（ChatOpenAI/ChatAnthropic），真实实例自带
  buildModelClient: jest.fn(() => ({ bindTools: jest.fn(), getName: () => 'ChatOpenAI' })),
  modelFingerprint: jest.fn(() => 'test-fingerprint'),
}));

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { clearTools } from '@/agent/tools/registry';
import { agentCacheStats, getAgent, syncSkills } from '@/agent/runtime/agent-factory';
import { ResolvedModelConfig } from '@/agent/runtime/model-factory';

const cfg: ResolvedModelConfig = {
  id: 1,
  name: 'kimi',
  provider: 'kimi',
  protocol: 'anthropic',
  baseUrl: 'https://api.kimi.com/coding/',
  modelName: 'kimi-for-coding',
  apiKey: 'sk-test',
  temperature: null,
  maxTokens: null,
};

describe('agent-factory: deep agent assembly', () => {
  afterEach(() => clearTools());

  it('assembles a deep agent with filesystem backend, skills and read-only permissions', async () => {
    const agent = await getAgent(cfg, 'inspection');
    expect(agent).toBeTruthy();
    expect(typeof agent.invoke).toBe('function');
    expect(agentCacheStats().size).toBe(1);
  });

  it('caches agents by scene + model fingerprint', async () => {
    await getAgent(cfg, 'inspection');
    await getAgent(cfg, 'inspection');
    expect(agentCacheStats().keys).toEqual(['inspection:test-fingerprint']);
  });

  it('syncs bundled skills into the runtime skills dir', () => {
    syncSkills();
    const skillFile = join(tmpdir(), 'acm-skills', 'log-search', 'SKILL.md');
    expect(existsSync(skillFile)).toBe(true);
    const content = readFileSync(skillFile, 'utf8');
    expect(content).toContain('name: log-search');
    expect(content).toContain('grep-first');
  });

  it('ships a spec-compliant SKILL.md (name matches parent dir, description within 1024 chars)', () => {
    const content = readFileSync(join(__dirname, '../../../..', 'src/agent/skills/log-search/SKILL.md'), 'utf8');
    const frontmatter = content.split('---')[1];
    const name = frontmatter.match(/name:\s*(.+)/)?.[1]?.trim();
    const description = frontmatter.match(/description:\s*([\s\S]*?)(?=\n[a-z-]+:|$)/)?.[1]?.trim() ?? '';
    expect(name).toBe('log-search');
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(1024);
  });
});
