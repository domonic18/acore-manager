import { cacheService } from './cache.service';
import { env } from '@/config/env';
import { readRuntimeValues, SYSTEM_CONFIG_KEYS } from '@/config/system-config.reader';

// 图标代理上游解析：Redis 60s → DB(icon_upstreams) → env(ICON_UPSTREAMS) → 内置默认 zamimg。
// 图标请求并发高（详情页 50+ img 同时加载），不宜逐请求查 PG；系统配置页保存时 del 缓存键即时生效。

export const ICON_UPSTREAMS_CACHE_KEY = 'icon:upstreams';

const DEFAULT_UPSTREAMS = ['https://wow.zamimg.com/images/wow/icons/medium'];

function parseUpstreams(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function resolveIconUpstreams(): Promise<string[]> {
  const cached = await cacheService.get<string[]>(ICON_UPSTREAMS_CACHE_KEY);
  if (cached && cached.length > 0) {
    return cached;
  }

  const dbValue = (await readRuntimeValues([SYSTEM_CONFIG_KEYS.iconUpstreams])).get(
    SYSTEM_CONFIG_KEYS.iconUpstreams,
  );
  const raw = dbValue?.trim() || env.ICON_UPSTREAMS.trim();
  const resolved = raw ? parseUpstreams(raw) : DEFAULT_UPSTREAMS;

  await cacheService.set(ICON_UPSTREAMS_CACHE_KEY, resolved, 60);
  return resolved;
}
