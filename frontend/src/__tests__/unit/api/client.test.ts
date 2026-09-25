import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiClient } from '@/shared/api/client';

// 手写响应桩：jsdom 环境下不依赖全局 fetch/Response 的实现差异
function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): {
  status: number;
  ok: boolean;
  statusText: string;
  headers: Map<string, string>;
  json: () => Promise<unknown>;
} {
  return {
    status,
    ok: status < 400,
    statusText: 'Stub',
    headers: new Map(Object.entries(headers)),
    json: async () => body,
  };
}

const gate503 = (code: string, error: string) =>
  jsonResponse(503, { success: false, code, error }, { 'Retry-After': '1' });

describe('apiClient 503 gate handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('retries DB_INITIALIZING per Retry-After and succeeds transparently', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(gate503('DB_INITIALIZING', 'init'))
      .mockResolvedValueOnce(gate503('DB_INITIALIZING', 'init'))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: { hello: 1 } }));
    vi.stubGlobal('fetch', fetchMock);

    vi.useFakeTimers();
    const promise = apiClient.get('/api/ping');
    await vi.advanceTimersByTimeAsync(1_000); // 第一次重试等待
    await vi.advanceTimersByTimeAsync(1_000); // 第二次重试等待
    const data = await promise;

    expect(data).toEqual({ hello: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws friendly error after exhausting DB_INITIALIZING retries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(gate503('DB_INITIALIZING', 'init'));
    vi.stubGlobal('fetch', fetchMock);

    vi.useFakeTimers();
    const promise = apiClient.get('/api/ping');
    // 先挂上 rejects 断言再推进定时器，避免 rejection 先于 handler 被标记为 unhandled
    const assertion = expect(promise).rejects.toThrow('服务启动中，请稍后重试');
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);

    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws friendly error immediately on DB_DEGRADED without retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(gate503('DB_DEGRADED', 'down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.get('/api/ping')).rejects.toThrow('数据库暂不可用，请稍后重试');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps raw HTTP error for non-gate 503', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(503, { success: false, error: 'proxy error' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.get('/api/ping')).rejects.toThrow('HTTP 503');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
