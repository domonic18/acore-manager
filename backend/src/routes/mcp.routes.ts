import { Request, Response, Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthService } from '@/services/mcp/auth.service';
import { createMcpServer } from '@/services/mcp/server';

// MCP 协议端点：POST /api/mcp（Streamable HTTP，无状态）
//
// 无状态 = 每请求新建 Server + Transport，零会话存储：SCF 多实例并发扩容天然可用，
// 也不存在 session 泄漏。响应走 enableJsonResponse（纯 JSON，不开 SSE 长连接）。
// 鉴权：Authorization: Bearer <API-KEY>，失败统一 401（不区分原因，避免被探测）。

const router = Router();

function rpcError(res: Response, status: number, code: number, message: string): void {
  res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });
}

router.post('/', async (req: Request, res: Response) => {
  const authorization = req.headers.authorization ?? '';
  const plain = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!plain || !(await mcpAuthService.verifyApiKey(plain))) {
    res.set('WWW-Authenticate', 'Bearer');
    rpcError(res, 401, -32001, 'Unauthorized');
    return;
  }

  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    // 全局 express.json() 已解析请求体，必须显式回传，避免传输层重复消费流
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      rpcError(res, 500, -32603, (err as Error)?.message ?? 'Internal Error');
    } else {
      res.end();
    }
  }
});

router.get('/', (_req: Request, res: Response) => {
  res.set('Allow', 'POST');
  rpcError(res, 405, -32000, 'Method Not Allowed');
});

router.delete('/', (_req: Request, res: Response) => {
  res.set('Allow', 'POST');
  rpcError(res, 405, -32000, 'Method Not Allowed');
});

export default router;
