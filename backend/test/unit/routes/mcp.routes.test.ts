import request from 'supertest';
import express, { Application } from 'express';
import mcpRoutes from '@/routes/mcp.routes';
import { mcpAuthService } from '@/services/mcp/auth.service';

jest.mock('@/services/mcp/auth.service', () => ({
  mcpAuthService: { verifyApiKey: jest.fn() },
}));

const verifyApiKey = mcpAuthService.verifyApiKey as jest.Mock;

const ACCEPT = 'application/json, text/event-stream';

function initBody(id = 1) {
  return {
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'probe', version: '1.0.0' },
    },
  };
}

describe('POST /api/mcp', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/mcp', mcpRoutes);
  });

  it('缺少 Authorization 头 → 401', async () => {
    const res = await request(app).post('/api/mcp').set('Accept', ACCEPT).send(initBody());
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
    expect(verifyApiKey).not.toHaveBeenCalled();
  });

  it('key 不匹配 → 401', async () => {
    verifyApiKey.mockResolvedValue(false);
    const res = await request(app)
      .post('/api/mcp')
      .set('Accept', ACCEPT)
      .set('Authorization', 'Bearer wrong')
      .send(initBody());
    expect(res.status).toBe(401);
  });

  it('key 正确 → initialize 返回协议版本', async () => {
    verifyApiKey.mockResolvedValue(true);
    const res = await request(app)
      .post('/api/mcp')
      .set('Accept', ACCEPT)
      .set('Authorization', 'Bearer good')
      .send(initBody());
    expect(res.status).toBe(200);
    expect(res.body.jsonrpc).toBe('2.0');
    expect(res.body.result.protocolVersion).toBe('2025-06-18');
    expect(res.body.result.serverInfo.name).toBe('acore-manager');
  });

  it('tools/list 返回 5 个工具', async () => {
    verifyApiKey.mockResolvedValue(true);
    const res = await request(app)
      .post('/api/mcp')
      .set('Accept', ACCEPT)
      .set('Authorization', 'Bearer good')
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    expect(res.status).toBe(200);
    const names = res.body.result.tools.map((t: { name: string }) => t.name).sort();
    expect(names).toEqual([
      'check_account_banned',
      'create_targeted_analysis',
      'get_targeted_analysis',
      'list_bans',
      'list_targeted_analyses',
    ]);
  });

  it('tools/call 未知工具 → 结果内标记 isError', async () => {
    verifyApiKey.mockResolvedValue(true);
    const res = await request(app)
      .post('/api/mcp')
      .set('Accept', ACCEPT)
      .set('Authorization', 'Bearer good')
      .send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'not_a_tool', arguments: {} } });
    expect(res.status).toBe(200);
    expect(res.body.result.isError).toBe(true);
    expect(res.body.result.content[0].text).toContain('not_a_tool');
  });

  it('非 POST 方法 → 405', async () => {
    const res = await request(app).get('/api/mcp');
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('POST');
  });
});
