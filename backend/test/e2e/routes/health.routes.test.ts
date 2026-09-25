import request from 'supertest';
import express, { Application } from 'express';
import { responseFormatter } from '@/middleware/response-formatter';
import healthRoutes from '@/routes/health.routes';

const mockGetServiceState = jest.fn();

jest.mock('@/config/database', () => ({
  getServiceState: () => mockGetServiceState(),
  authDataSource: { isInitialized: true },
  charactersDataSource: { isInitialized: true },
  worldDataSource: { isInitialized: true },
  acmDataSource: { isInitialized: true },
}));

jest.mock('@/config/redis', () => ({
  redis: { status: 'ready' },
}));

jest.mock('@/middleware/auth', () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  AuthRequest: class {},
}));

describe('Health routes', () => {
  let app: Application;

  beforeEach(() => {
    jest.requireMock('@/config/database').acmDataSource.isInitialized = true;
    app = express();
    app.use(responseFormatter);
    app.use('/api/health', healthRoutes);
  });

  describe('GET /api/health (liveness)', () => {
    it('returns 200 with current state when ready', async () => {
      mockGetServiceState.mockReturnValue('ready');
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { status: 'ready' } });
    });

    it('returns 200 with state when degraded (liveness always passes)', async () => {
      mockGetServiceState.mockReturnValue('degraded');
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { status: 'degraded' } });
    });
  });

  describe('GET /api/health/ready (readiness)', () => {
    it('returns 200 when ready', async () => {
      mockGetServiceState.mockReturnValue('ready');
      const res = await request(app).get('/api/health/ready');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, data: { state: 'ready' } });
    });

    it('returns 503 NOT_READY when not ready', async () => {
      mockGetServiceState.mockReturnValue('starting');
      const res = await request(app).get('/api/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('NOT_READY');
      expect(res.body.error).toBe('starting');
    });
  });

  describe('GET /api/health/detail', () => {
    it('returns state and per-dependency booleans', async () => {
      mockGetServiceState.mockReturnValue('ready');
      const res = await request(app).get('/api/health/detail');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        state: 'ready',
        uptimeSeconds: expect.any(Number),
        dependencies: {
          authDb: true,
          charactersDb: true,
          worldDb: true,
          acmDb: true,
          redis: true,
        },
      });
    });

    it('reflects uninitialized dependencies', async () => {
      mockGetServiceState.mockReturnValue('degraded');
      jest.requireMock('@/config/database').acmDataSource.isInitialized = false;
      const res = await request(app).get('/api/health/detail');

      expect(res.status).toBe(200);
      expect(res.body.data.state).toBe('degraded');
      expect(res.body.data.dependencies.acmDb).toBe(false);
    });
  });
});
