import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
// 动态导入失败在浏览器里的几种报错文案（Chromium / Firefox / Safari 措辞不同）
const CHUNK_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
  'Unable to preload CSS',
];

const RETRY_DELAY_MS = 600;
const MAX_ATTEMPTS = 2;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

export function describeChunkError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 带重试的懒加载：chunk 首次加载失败多半是瞬时故障（网关 5xx / 网络抖动），
 * 退避后重试一次即可恢复；重试仍失败才抛给上层 ErrorBoundary 降级，
 * 避免一个附属 chunk 加载失败把整个后台打成 "Unexpected Application Error!"。
 */
export function lazyWithRetry(
  factory: () => Promise<{ default: ComponentType }>,
  label: string,
): LazyExoticComponent<ComponentType> {
  return lazy(async () => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await factory();
      } catch (error) {
        lastError = error;
        if (attempt < MAX_ATTEMPTS) {
          console.warn(`[chunk-load] ${label} 第 ${attempt} 次加载失败，${RETRY_DELAY_MS}ms 后重试`, error);
          await sleep(RETRY_DELAY_MS);
        }
      }
    }
    console.error(`[chunk-load] ${label} 加载失败，已重试 ${MAX_ATTEMPTS - 1} 次`, lastError);
    throw lastError;
  });
}
