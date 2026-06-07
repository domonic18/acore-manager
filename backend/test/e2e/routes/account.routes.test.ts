import request from 'supertest';
import express, { Application } from 'express';
import { responseFormatter } from '../../../src/middleware/response-formatter';
import accountRoutes from '../../../src/routes/account.routes';
import { accountService } from '../../../src/services/account.service';

jest.mock('../../../src/services/account.service');
jest.mock('../../../src/middleware/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
  AuthRequest: class {},
}));
jest.mock('../../../src/middleware/gm-guard', () => ({
  requireGmLevel: (_level: number) => (_req: any, _res: any, next: any) => next(),
}));

describe('Account Routes', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(responseFormatter);
    app.use('/api/accounts', accountRoutes);
  });

  describe('GET /api/accounts', () => {
    it('returns account list', async () => {
      const mockData = {
        items: [{ id: 1, username: 'admin' }],
        total: 1,
        page: 1,
        pageSize: 20,
      };
      (accountService.listAccounts as jest.Mock).mockResolvedValue(mockData);

      const res = await request(app).get('/api/accounts');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        count: 1,
        data: mockData,
      });
    });
  });

  describe('GET /api/accounts/:id', () => {
    it('returns account detail with bans', async () => {
      const mockDetail = { id: 1, username: 'admin' };
      const mockBans = [{ banDate: new Date(), banReason: '违规' }];
      (accountService.getAccountDetail as jest.Mock).mockResolvedValue(mockDetail);
      (accountService.getBanRecords as jest.Mock).mockResolvedValue(mockBans);

      const res = await request(app).get('/api/accounts/1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bans).toHaveLength(1);
    });

    it('returns 404 when account not found', async () => {
      (accountService.getAccountDetail as jest.Mock).mockResolvedValue(null);

      const res = await request(app).get('/api/accounts/999');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/accounts/:id/characters', () => {
    it('returns character list', async () => {
      const mockChars = [{ guid: 1, name: 'Hero' }];
      (accountService.getAccountCharacters as jest.Mock).mockResolvedValue(mockChars);

      const res = await request(app).get('/api/accounts/1/characters');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(mockChars);
    });
  });

  describe('POST /api/accounts/:id/ban', () => {
    it('bans an account', async () => {
      (accountService.banAccount as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/accounts/1/ban')
        .send({ duration: '1d', reason: '违规' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(accountService.banAccount).toHaveBeenCalledWith(1, expect.any(Number), '1d', '违规');
    });
  });

  describe('POST /api/accounts/:id/unban', () => {
    it('unbans an account', async () => {
      (accountService.unbanAccount as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app).post('/api/accounts/1/unban');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/accounts/:id/change-password', () => {
    it('changes password', async () => {
      (accountService.changePassword as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/accounts/1/change-password')
        .send({ password: 'newpass123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/accounts/gm/list', () => {
    it('returns GM account list', async () => {
      const mockGms = [{ accountId: 1, username: 'admin', gmlevel: 3 }];
      (accountService.listGmAccounts as jest.Mock).mockResolvedValue(mockGms);

      const res = await request(app).get('/api/accounts/gm/list');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(mockGms);
    });
  });
});
