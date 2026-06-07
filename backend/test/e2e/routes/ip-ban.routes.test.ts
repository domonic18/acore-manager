import request from 'supertest';
import express, { Application } from 'express';
import { responseFormatter } from '../../../src/middleware/response-formatter';
import ipBanRoutes from '../../../src/routes/ip-ban.routes';
import { ipBanService } from '../../../src/services/ip-ban.service';

jest.mock('../../../src/services/ip-ban.service');
jest.mock('../../../src/middleware/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
  AuthRequest: class {},
}));
jest.mock('../../../src/middleware/gm-guard', () => ({
  requireGmLevel: (_level: number) => (_req: any, _res: any, next: any) => next(),
}));

describe('IP Ban Routes', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(responseFormatter);
    app.use('/api/ip-bans', ipBanRoutes);
  });

  describe('GET /api/ip-bans', () => {
    it('returns IP ban list', async () => {
      const mockData = {
        items: [{ ip: '192.168.1.1', banReason: '违规' }],
        total: 1,
        page: 1,
        pageSize: 20,
      };
      (ipBanService.listIpBans as jest.Mock).mockResolvedValue(mockData);

      const res = await request(app).get('/api/ip-bans');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        count: 1,
        data: mockData,
      });
    });
  });

  describe('POST /api/ip-bans', () => {
    it('creates an IP ban', async () => {
      (ipBanService.banIp as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/ip-bans')
        .send({ ip: '192.168.1.1', duration: '1d', reason: '违规' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(ipBanService.banIp).toHaveBeenCalledWith('192.168.1.1', '1d', '违规', expect.any(Number));
    });

    it('returns 400 for invalid IP', async () => {
      const res = await request(app)
        .post('/api/ip-bans')
        .send({ ip: 'invalid', duration: '1d', reason: '违规' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/ip-bans/:ip', () => {
    it('removes an IP ban', async () => {
      (ipBanService.unbanIp as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app).delete('/api/ip-bans/192.168.1.1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
