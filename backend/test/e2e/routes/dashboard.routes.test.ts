import request from 'supertest';
import express, { Application } from 'express';
import { responseFormatter } from '@/middleware/response-formatter';
import dashboardRoutes from '@/routes/dashboard.routes';
import { dashboardService } from '@/services/dashboard.service';

jest.mock('@/services/dashboard.service');
jest.mock('@/middleware/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
  AuthRequest: class {},
}));

describe('Dashboard Routes', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(responseFormatter);
    app.use('/api/dashboard', dashboardRoutes);
  });

  describe('GET /api/dashboard/stats', () => {
    it('returns dashboard stats', async () => {
      const mockStats = { onlinePlayers: 42, newAccountsToday: 3, activeAccountsToday: 25 };
      (dashboardService.getStats as jest.Mock).mockResolvedValue(mockStats);

      const res = await request(app).get('/api/dashboard/stats');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: mockStats,
      });
    });
  });
});
