import { shouldCompress } from '@/middleware/compression';

function mockRes(contentType?: string, headers: Record<string, string> = {}) {
  const all: Record<string, string | undefined> = { 'Content-Type': contentType, ...headers };
  return {
    getHeader: (name: string) => all[name],
    setHeader: () => undefined,
  } as never;
}

const mockReq = { method: 'GET', headers: {} } as never;

describe('shouldCompress', () => {
  it('压缩前端静态资源与 API JSON', () => {
    expect(shouldCompress(mockReq, mockRes('application/javascript; charset=UTF-8'))).toBe(true);
    expect(shouldCompress(mockReq, mockRes('text/css; charset=UTF-8'))).toBe(true);
    expect(shouldCompress(mockReq, mockRes('application/json; charset=utf-8'))).toBe(true);
  });

  it('SSE 流式响应不压缩（压缩会缓冲分片，破坏增量到达）', () => {
    expect(shouldCompress(mockReq, mockRes('text/event-stream; charset=utf-8'))).toBe(false);
  });

  it('不可压缩类型不压缩', () => {
    expect(shouldCompress(mockReq, mockRes('image/png'))).toBe(false);
    expect(shouldCompress(mockReq, mockRes(undefined))).toBe(false);
  });
});
