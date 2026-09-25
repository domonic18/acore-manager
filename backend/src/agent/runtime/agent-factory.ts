import { createDeepAgent, CompositeBackend, FilesystemBackend } from 'deepagents';
import { cpSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { env } from '@/config/env';
import { readRuntimeNumber, SYSTEM_CONFIG_KEYS } from '@/config/system-config.reader';
import { logger } from '@/middleware/request-logger';
import { buildModelClient, modelFingerprint, ResolvedModelConfig } from './model-factory';
import { getCheckpointer } from './checkpointer';
import { loadPrompt } from '@/agent/core/prompt-loader';
import { registerAllTools } from '@/agent/tools';
import { exportTools } from '@/agent/tools/registry';
import { WORKSPACE_ROOT } from '@/agent/tools/log-tools/log-workspace';

// agent 装配与指纹 LRU 缓存（arch 3.2.1 / 3.2.2）：
// 模型配置热生效——配置落库后按出口指纹构建新实例，旧实例闲置 2h 淘汰；巡检与对话共用本工厂。
// 文件后端按路径前缀路由：默认 → 日志工作区（fetch 解压产物，grep/read 检索），
// /skills/ → dist 随包 skills 同步副本（grep-first 方法论，只读）。
// 注意 skills 不能放 WORKSPACE_ROOT 下：clearWorkspace 会整删该目录。
export type AgentScene = 'assistant' | 'inspection' | 'analysis';
export type DeepAgentInstance = ReturnType<typeof createDeepAgent>;

const IDLE_EVICT_MS = 2 * 60 * 60 * 1000;
const SKILLS_SYNC_DIR = join(tmpdir(), 'acm-skills');
const DIST_SKILLS_DIR = join(__dirname, '..', 'skills');

interface CacheEntry {
  agent: DeepAgentInstance;
  lastUsed: number;
}

const cache = new Map<string, CacheEntry>();

export async function getAgent(cfg: ResolvedModelConfig, scene: AgentScene): Promise<DeepAgentInstance> {
  const key = `${scene}:${modelFingerprint(cfg)}`;
  evictIdle();
  const maxSize = await readRuntimeNumber(SYSTEM_CONFIG_KEYS.aiAgentCacheSize, env.AI_AGENT_CACHE_SIZE);

  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit); // Map 保持插入序 → delete+set 即 LRU touch
    hit.lastUsed = Date.now();
    return hit.agent;
  }

  const agent = await buildAgent(cfg, scene);
  cache.set(key, { agent, lastUsed: Date.now() });
  evictOverflow(maxSize);
  logger.info(`[agent-factory] built agent scene=${scene} config=${cfg.name} cacheSize=${cache.size}`);
  return agent;
}

export function agentCacheStats(): { size: number; keys: string[] } {
  return { size: cache.size, keys: [...cache.keys()] };
}

export function syncSkills(): void {
  if (!existsSync(DIST_SKILLS_DIR)) return;
  cpSync(DIST_SKILLS_DIR, SKILLS_SYNC_DIR, { recursive: true, force: true });
}

async function buildAgent(cfg: ResolvedModelConfig, scene: AgentScene): Promise<DeepAgentInstance> {
  registerAllTools();
  const model = buildModelClient(cfg);
  const checkpointer = await getCheckpointer();
  syncSkills();
  const backend = new CompositeBackend(
    new FilesystemBackend({ rootDir: WORKSPACE_ROOT, virtualMode: true }),
    { '/skills/': new FilesystemBackend({ rootDir: SKILLS_SYNC_DIR, virtualMode: true }) },
  );
  return createDeepAgent({
    // tsc 单实例通过、ts-jest 将 @langchain/core 解析为两套类型导致误报；运行时是同一实例
    model: model as any,
    tools: exportTools(),
    systemPrompt: loadPrompt(scene),
    checkpointer,
    backend,
    skills: ['/skills/'],
    // agent 只读取证：拒绝全部虚拟根写入（含 skills 目录），写操作一律走平台由 GM 执行
    permissions: [{ operations: ['write'], paths: ['/'], mode: 'deny' }],
  });
}

function evictIdle(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.lastUsed > IDLE_EVICT_MS) {
      cache.delete(key);
      logger.info(`[agent-factory] evicted idle agent: ${key}`);
    }
  }
}

function evictOverflow(maxSize: number): void {
  const max = Math.max(1, maxSize);
  while (cache.size > max) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
    logger.info(`[agent-factory] evicted LRU agent: ${oldest}`);
  }
}
