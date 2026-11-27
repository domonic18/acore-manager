import compression from 'compression';
import {
  acceptsCompression,
  restoreBrowserAcceptEncoding,
  shouldCompress,
} from '@/middleware/compression';

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

function restore(headers: Record<string, string>) {
  const req = mockReq(headers);
  const next = jest.fn();
  restoreBrowserAcceptEncoding(req, mockRes(), next);
  expect(next).toHaveBeenCalled();
  return req as unknown as { headers: Record<string, string | undefined> };
}

describe('acceptsCompression', () => {
  it('识别可用的压缩编码', () => {
    expect(acceptsCompression('gzip')).toBe(true);
    expect(acceptsCompression('gzip, deflate, br')).toBe(true);
    expect(acceptsCompression('*')).toBe(true);
    expect(acceptsCompression('identity')).toBe(false);
    expect(acceptsCompression('')).toBe(false);
    expect(acceptsCompression(undefined)).toBe(false);
  });

  it('q=0 视为不可用', () => {
    expect(acceptsCompression('gzip;q=0')).toBe(false);
    expect(acceptsCompression('gzip;q=0.5')).toBe(true);
  });
});

describe('restoreBrowserAcceptEncoding', () => {
  it('网关改写为 identity 时，浏览器请求恢复 gzip', () => {
    expect(restore({ 'user-agent': BROWSER_UA, 'accept-encoding': 'identity' }).headers['accept-encoding'])
      .toBe('gzip');
  });

  it('网关剥掉 Accept-Encoding 时，浏览器请求恢复 gzip', () => {
    expect(restore({ 'user-agent': BROWSER_UA }).headers['accept-encoding']).toBe('gzip');
  });

  it('客户端已声明可压缩编码时保持原样（走正常协商，可选 br）', () => {
    expect(restore({ 'user-agent': BROWSER_UA, 'accept-encoding': 'gzip, deflate, br' }).headers['accept-encoding'])
      .toBe('gzip, deflate, br');
  });

  it('脚本类客户端保持原样（从未声明支持压缩，避免收到乱码）', () => {
    expect(restore({ 'user-agent': 'curl/8.7.1' }).headers['accept-encoding']).toBeUndefined();
    expect(restore({ 'user-agent': 'curl/8.7.1', 'accept-encoding': 'identity' }).headers['accept-encoding'])
      .toBe('identity');
  });

  it('带 Sec-Fetch-* 的客户端按浏览器处理（网关剥掉 UA 时仍可恢复）', () => {
    expect(restore({ 'sec-fetch-mode': 'cors' }).headers['accept-encoding']).toBe('gzip');
  });
});

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

  it('客户端未声明 Accept-Encoding 时不压缩', () => {
    expect(shouldCompress(mockReq({ 'user-agent': BROWSER_UA }), mockRes('application/javascript'))).toBe(false);
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
