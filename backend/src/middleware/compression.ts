import compression from 'compression';
import type { Request, Response } from 'express';

/**
 * 生产全链路无 gzip（SCF 网关只透传，Express 侧也没有压缩）：入口 chunk 272KB /
 * Dashboard 388KB / markdown 栈 157KB 全部原文直传，移动端首屏 ≈900KB，是 chunk
 * 动态导入频繁失败的首要原因。这里补运行时压缩（静态资源 + API JSON 同时受益）。
 *
 * SSE 必须排除：压缩中间件会缓冲分片，破坏 /api/ai/assistant/chat 的流式增量到达
 * （SSE 响应已带 Cache-Control: no-cache, no-transform）。
 *
 * 生产实测补充：SCF 网关**不把客户端的 Accept-Encoding 转发给容器**。证据：容器内
 * Express 已挂本中间件（响应带 Vary: Accept-Encoding —— 该头仅在 filter 通过后才写），
 * 但生产响应无 Content-Encoding 且响应体为原文，即协商阶段拿不到任何编码偏好
 * （compression 内部走 Negotiator，请求头缺失时无编码可选）。故对浏览器请求兜底强制 gzip。
 */
export function shouldCompress(req: Request, res: Response): boolean {
  const contentType = res.getHeader('Content-Type');
  if (typeof contentType === 'string' && contentType.includes('text/event-stream')) return false;
  // 请求头被网关吃掉时，只有浏览器能安全兜底强制压缩：脚本类客户端（curl / node fetch）
  // 从未声明支持压缩，给它们发 gzip 会拿到乱码
  if (!req.headers['accept-encoding'] && !isBrowserClient(req)) return false;
  return compression.filter(req, res);
}

/** 浏览器 / 内嵌 WebView（UA 含 Mozilla）；其余客户端不强制压缩 */
function isBrowserClient(req: Request): boolean {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' && ua.includes('Mozilla');
}

export const compressionMiddleware = compression({
  filter: shouldCompress,
  // 无 Accept-Encoding 请求头时（网关剥掉）兜底用 gzip；请求头在时仍走正常协商（br/gzip/identity）
  enforceEncoding: 'gzip',
});
