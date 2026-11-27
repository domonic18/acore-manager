import compression from 'compression';
import { shouldCompress } from '@/middleware/compression';

function mockRes(contentType?: string, headers: Record<string, string> = {}) {
  const all: Record<string, string | undefined> = { 'Content-Type': contentType, ...headers };
  return {
    getHeader: (name: string) => all[name],
    setHeader: () => undefined,
  } as never;
}

function mockReq(headers: Record<string, string> = {}, method = 'GET') {
  return { method, headers } as never;
}

const BROWSER_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) MicroMessenger/8.0';
const browserReq = () => mockReq({ 'user-agent': BROWSER_UA, 'accept-encoding': 'gzip, deflate, br' });

describe('shouldCompress', () => {
  it('压缩前端静态资源与 API JSON', () => {
    expect(shouldCompress(browserReq(), mockRes('application/javascript; charset=UTF-8'))).toBe(true);
    expect(shouldCompress(browserReq(), mockRes('text/css; charset=UTF-8'))).toBe(true);
    expect(shouldCompress(browserReq(), mockRes('application/json; charset=utf-8'))).toBe(true);
  });

  it('SSE 流式响应不压缩（压缩会缓冲分片，破坏增量到达）', () => {
    expect(shouldCompress(browserReq(), mockRes('text/event-stream; charset=utf-8'))).toBe(false);
  });

  it('不可压缩类型不压缩', () => {
    expect(shouldCompress(browserReq(), mockRes('image/png'))).toBe(false);
    expect(shouldCompress(browserReq(), mockRes(undefined))).toBe(false);
  });

  it('网关剥掉 Accept-Encoding 时：浏览器请求仍放行（由 enforceEncoding 兜底 gzip）', () => {
    const req = mockReq({ 'user-agent': BROWSER_UA });
    expect(shouldCompress(req, mockRes('application/javascript; charset=UTF-8'))).toBe(true);
  });

  it('网关剥掉 Accept-Encoding 时：脚本类客户端不强制压缩（从未声明支持，避免收到乱码）', () => {
    expect(shouldCompress(mockReq({ 'user-agent': 'curl/8.7.1' }), mockRes('application/javascript'))).toBe(false);
    expect(shouldCompress(mockReq(), mockRes('application/javascript'))).toBe(false);
  });

  it('客户端自带 Accept-Encoding 时按其声明放行（含 identity）', () => {
    expect(shouldCompress(mockReq({ 'accept-encoding': 'gzip, deflate, br' }), mockRes('application/javascript'))).toBe(true);
    expect(shouldCompress(mockReq({ 'accept-encoding': 'identity' }), mockRes('application/javascript'))).toBe(true);
  });

  it('默认 compression.filter 判定未被绕过（不可压缩类型即便有请求头也不压缩）', () => {
    expect(compression.filter(mockReq({ 'accept-encoding': 'gzip' }), mockRes('image/png'))).toBe(false);
  });
});
