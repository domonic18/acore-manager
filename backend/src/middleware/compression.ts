import compression from 'compression';
import type { Request, Response } from 'express';

// 生产全链路无 gzip（SCF 网关只透传，Express 侧也没有压缩）：入口 chunk 272KB /
// Dashboard 388KB / markdown 栈 157KB 全部原文直传，移动端首屏 ≈900KB，是 chunk
// 动态导入频繁失败的首要原因。这里补运行时压缩（静态资源 + API JSON 同时受益）。
//
// SSE 必须排除：压缩中间件会缓冲分片，破坏 /api/ai/assistant/chat 的流式增量到达
// （SSE 响应已带 Cache-Control: no-cache, no-transform）。
export function shouldCompress(req: Request, res: Response): boolean {
  const contentType = res.getHeader('Content-Type');
  if (typeof contentType === 'string' && contentType.includes('text/event-stream')) return false;
  return compression.filter(req, res);
}

export const compressionMiddleware = compression({ filter: shouldCompress });
