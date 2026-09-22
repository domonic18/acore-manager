import { createDeepAgent } from 'deepagents';
import { env } from '@/config/env';
import { logger } from '@/middleware/request-logger';
import { buildModelClient, modelFingerprint, ResolvedModelConfig } from './model-factory';
import { getCheckpointer } from './checkpointer';
import { loadPrompt } from '@/agent/core/prompt-loader';
import { registerAllTools } from '@/agent/tools';
import { exportTools } from '@/agent/tools/registry';

// agent 装配与指纹 LRU 缓存（arch 3.2.1 / 3.2.2）：
// 模型配置热生效——配置落库后按出口指纹构建新实例，旧实例闲置 2h 淘汰；巡检与对话共用本工厂。
export type AgentScene = 'assistant' | 'inspection' | 'analysis';
export type DeepAgentInstance = ReturnType<typeof createDeepAgent>;

const IDLE_EVICT_MS = 2 * 60 * 60 * 1000;

interface CacheEntry {
  agent: DeepAgentInstance;
  lastUsed: number;
}

const cache = new Map<string, CacheEntry>();

export async function getAgent(cfg: ResolvedModelConfig, scene: AgentScene): Promise<DeepAgentInstance> {
  const key = `${scene}:${modelFingerprint(cfg)}`;
  evictIdle();

  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit); // Map 保持插入序 → delete+set 即 LRU touch
    hit.lastUsed = Date.now();
    return hit.agent;
  }

  const agent = await buildAgent(cfg, scene);
  cache.set(key, { agent, lastUsed: Date.now() });
  evictOverflow();
  logger.info(`[agent-factory] built agent scene=${scene} config=${cfg.name} cacheSize=${cache.size}`);
  return agent;
}

export function agentCacheStats(): { size: number; keys: string[] } {
  return { size: cache.size, keys: [...cache.keys()] };
}

async function buildAgent(cfg: ResolvedModelConfig, scene: AgentScene): Promise<DeepAgentInstance> {
  registerAllTools();
  const model = buildModelClient(cfg);
  const checkpointer = await getCheckpointer();
  return createDeepAgent({
    model,
    tools: exportTools(),
    systemPrompt: loadPrompt(scene),
    checkpointer,
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

function evictOverflow(): void {
  const max = Math.max(1, env.AI_AGENT_CACHE_SIZE);
  while (cache.size > max) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
    logger.info(`[agent-factory] evicted LRU agent: ${oldest}`);
  }
}
