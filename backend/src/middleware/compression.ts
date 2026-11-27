import compression from 'compression';
import type { NextFunction, Request, Response } from 'express';

/**
 * 生产全链路无 gzip（移动端首屏 ≈900KB 原文直传，是 chunk 动态导入频繁失败的首要原因）。
 * 这里补运行时压缩（静态资源 + API JSON 同时受益）。
 *
 * 生产实测（2026-11-27，mgr.lokta.cn）：SCF 网关（openresty）把客户端的 Accept-Encoding
 * 改写成非压缩编码，容器侧 Negotiator 协商恒为 identity，compression 判 'not acceptable'
 * 跳过压缩；网关自身的 nginx gzip_proxied 关闭（回源响应不由网关压缩），两道关口叠加
 * 导致响应全程原文直传。
 *
 * 对策：请求头不可信时改用「客户端能否解码」判断 —— 浏览器 / 内嵌 WebView 必然支持 gzip，
 * 把它们的可接受编码恢复为 gzip；脚本类客户端（curl / node fetch）从不声明支持压缩，
 * 保持原文，避免收到乱码。
 *
 * SSE 必须排除：压缩中间件会缓冲分片，破坏 /api/ai/assistant/chat 的流式增量到达
 * （SSE 响应已带 Cache-Control: no-cache, no-transform）。
 */

/** 浏览器 / 内嵌 WebView：UA 含 Mozilla，或带 Sec-Fetch-*（现代浏览器必发，curl 不发） */
function isBrowserClient(req: Request): boolean {
  const ua = req.headers['user-agent'];
  if (typeof ua === 'string' && ua.includes('Mozilla')) return true;
  return Object.keys(req.headers).some((name) => name.startsWith('sec-fetch-'));
}

/** 请求头是否声明了可用的压缩编码（gzip / deflate / br / * 且 q>0） */
export function acceptsCompression(acceptEncoding: string | undefined): boolean {
  if (!acceptEncoding) return false;
  return acceptEncoding.split(',').some((part) => {
    const [encoding, ...params] = part.split(';');
    if (!/^(gzip|deflate|br|\*)$/i.test(encoding.trim())) return false;
    const q = params.map((p) => p.trim()).find((p) => /^q\s*=/i.test(p));
    return !q || Number(q.split('=')[1]) > 0;
  });
}

/**
 * 网关改写 Accept-Encoding 后浏览器请求的可接受编码丢失，这里恢复为 gzip：
 * 浏览器必定能解码 gzip，而网关改写前客户端声明的也正是 gzip 系编码。
 */
export function restoreBrowserAcceptEncoding(req: Request, _res: Response, next: NextFunction): void {
  if (isBrowserClient(req) && !acceptsCompression(req.headers['accept-encoding'])) {
    req.headers['accept-encoding'] = 'gzip';
  }
  next();
}

export function shouldCompress(req: Request, res: Response): boolean {
  const contentType = res.getHeader('Content-Type');
  if (typeof contentType === 'string' && contentType.includes('text/event-stream')) return false;
  // 客户端从未声明支持压缩：发 gzip 会拿到乱码
  if (!req.headers['accept-encoding']) return false;
  return compression.filter(req, res);
}

export const compressionMiddleware = compression({
  filter: shouldCompress,
});
