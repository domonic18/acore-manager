import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
// 动态导入失败在浏览器里的几种报错文案（Chromium / Firefox / Safari 措辞不同）
const CHUNK_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
  'Unable to preload CSS',
];

const RETRY_BASE_DELAY_MS = 800;
const MAX_ATTEMPTS = 5;

/** 重试预算可注入（单测用小预算，避免测试跑满整个退避窗口） */
export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

// 指数退避 + 抖动：避免多用户同时失败后同步重试形成请求风暴
function backoffDelayMs(attempt: number, baseDelayMs: number): number {
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  const jitter = exponential * 0.3 * (Math.random() * 2 - 1);
  return Math.max(baseDelayMs, Math.round(exponential + jitter));
}

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
 * 带重试的懒加载：chunk 首次加载失败多半是瞬时故障（网关抖动 / 冷启动排队 / 发布窗口版本错位），
 * 指数退避重试即可恢复；重试仍失败才抛给上层 ErrorBoundary 降级，
 * 避免一个附属 chunk 加载失败把整个后台打成 "Unexpected Application Error!"。
 * 注意每次 attempt 都重新调用 factory（重新发起 import()）——React.lazy 会缓存
 * rejected promise（react#14254），复用同一个失败 promise 的“重试”是无效的。
 *
 * 默认重试预算（5 次 / 退避 800ms 起，总等待 ≈12s）必须覆盖生产 SCF 的冷启动耗时：
 * 实测并发拉 chunk 触发扩容时，新实例冷启动约 4s——旧预算（3 次 / ≈1.5s）三次重试
 * 全落在同一个冷启动窗口内，等于没重试，必然直接报“助手不可用”。
 */
export function lazyWithRetry<P extends object = object>(
  factory: () => Promise<{ default: ComponentType<P> }>,
  label: string,
  options: RetryOptions = {},
): LazyExoticComponent<ComponentType<P>> {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? RETRY_BASE_DELAY_MS;
  return lazy(async () => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await factory();
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          const delay = backoffDelayMs(attempt, baseDelayMs);
          console.warn(`[chunk-load] ${label} 第 ${attempt} 次加载失败，${delay}ms 后重试`, error);
          await sleep(delay);
        }
      }
    }
    console.error(`[chunk-load] ${label} 加载失败，已重试 ${maxAttempts - 1} 次`, describeChunkError(lastError), lastError);
    throw lastError;
  });
}
