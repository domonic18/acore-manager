import request from 'supertest';
import express, { Application } from 'express';
import { responseFormatter } from '@/middleware/response-formatter';
import systemConfigRoutes from '@/routes/system-config.routes';
import { systemConfigService } from '@/services/system-config.service';
import { soapService } from '@/services/soap.service';

jest.mock('@/services/system-config.service');
jest.mock('@/services/soap.service');
jest.mock('@/services/ai/llm-config.service', () => ({
  ServiceError: class ServiceError extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
}));
jest.mock('@/middleware/auth', () => ({
  // x-test-gmlevel 头注入角色，模拟不同 GM 等级
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { id: 1, username: 'gm', gmlevel: Number(req.headers['x-test-gmlevel'] ?? 3) };
    next();
  },
  AuthRequest: class {},
}));
jest.mock('@/middleware/gm-guard', () => ({
  requireGmLevel: (level: number) => (req: any, res: any, next: any) => {
    if ((req.user?.gmlevel ?? 0) < level) {
      res.status(403).json({ success: false, message: 'Forbidden / 权限不足' });
      return;
    }
    next();
  },
}));

const VIEW = {
  defaultRealm: 'realm3',
  soap: { host: '10.0.0.5', port: 7878, username: 'envuser', passwordMasked: null, source: 'env' },
  updatedAt: null,
};

describe('System Config Routes', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    (systemConfigService.getView as jest.Mock).mockResolvedValue(VIEW);
    (systemConfigService.update as jest.Mock).mockImplementation(async (input: unknown) => input);
    (soapService.sendCommand as jest.Mock).mockResolvedValue('The server is running with 0 players.');
    app = express();
    app.use(express.json());
    app.use(responseFormatter);
    app.use('/api/system-config', systemConfigRoutes);
  });

  describe('gmlevel=3 权限门槛', () => {
    it('gmlevel=2 访问 GET / PUT / soap-test 均被拒绝 403', async () => {
      const get = await request(app).get('/api/system-config').set('x-test-gmlevel', '2');
      const put = await request(app).put('/api/system-config').set('x-test-gmlevel', '2').send({ defaultRealm: 'realm2' });
      const test = await request(app).post('/api/system-config/soap-test').set('x-test-gmlevel', '2');

      expect(get.status).toBe(403);
      expect(put.status).toBe(403);
      expect(test.status).toBe(403);
    });
  });

  describe('GET /api/system-config', () => {
    it('返回配置视图', async () => {
      const res = await request(app).get('/api/system-config');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual(VIEW);
    });
  });

  describe('PUT /api/system-config', () => {
    it('合法参数透传 service.update', async () => {
      const payload = { defaultRealm: 'realm2', soap: { host: 'h', port: 7878, username: 'u', password: 'p' } };
      const res = await request(app).put('/api/system-config').send(payload);

      expect(res.status).toBe(200);
      expect(systemConfigService.update).toHaveBeenCalledWith(payload, 1, 'gm');
    });

    it('非法 realm 名返回 400', async () => {
      const res = await request(app).put('/api/system-config').send({ defaultRealm: 'a' });
      expect(res.status).toBe(400);
      expect(systemConfigService.update).not.toHaveBeenCalled();
    });

    it('非法端口返回 400', async () => {
      const res = await request(app).put('/api/system-config').send({ soap: { port: 70000 } });
      expect(res.status).toBe(400);
      expect(systemConfigService.update).not.toHaveBeenCalled();
    });

    it('三组新增配置合法值（含 null 清除）透传', async () => {
      const payload = {
        feishu: { webhookUrl: '', webhookSecret: 's', webBaseUrl: null },
        ai: { dailyTokenBudget: 6000000, agentCacheSize: null, toolCallBudget: 25, toolTimeoutMs: 8000 },
        login: { bruteForceEnabled: 'true', maxAttempts: 8, lockoutMinutes: null, captchaEnabled: 'false', captchaTtlSeconds: 240 },
      };
      const res = await request(app).put('/api/system-config').send(payload);

      expect(res.status).toBe(200);
      expect(systemConfigService.update).toHaveBeenCalledWith(payload, 1, 'gm');
    });

    it('新增组非法值返回 400', async () => {
      const cases = [
        { feishu: { webBaseUrl: 'https://ok.example' }, ai: { agentCacheSize: 99 } },
        { login: { bruteForceEnabled: 'yes' } },
        { login: { captchaTtlSeconds: 10 } },
        { ai: { dailyTokenBudget: 100 } },
      ];
      for (const payload of cases) {
        const res = await request(app).put('/api/system-config').send(payload);
        expect(res.status).toBe(400);
      }
      expect(systemConfigService.update).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/system-config/soap-test', () => {
    it('命令回执正常时 ok=true', async () => {
      const res = await request(app).post('/api/system-config/soap-test');
      expect(res.status).toBe(200);
      expect(res.body.data.ok).toBe(true);
      expect(res.body.data.error).toBeNull();
      expect(soapService.sendCommand).toHaveBeenCalledWith('.server info');
    });

    it('回执含错误信息时 ok=false', async () => {
      (soapService.sendCommand as jest.Mock).mockResolvedValue('Error: connection refused by worldserver');
      const res = await request(app).post('/api/system-config/soap-test');
      expect(res.body.data.ok).toBe(false);
      expect(res.body.data.error).toContain('Error');
    });

    it('发送异常时 ok=false 并携带错误消息', async () => {
      (soapService.sendCommand as jest.Mock).mockRejectedValue(new Error('SOAP timeout'));
      const res = await request(app).post('/api/system-config/soap-test');
      expect(res.status).toBe(200);
      expect(res.body.data.ok).toBe(false);
      expect(res.body.data.error).toBe('SOAP timeout');
    });
  });
});
