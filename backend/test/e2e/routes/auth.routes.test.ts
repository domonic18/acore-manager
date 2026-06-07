import request from 'supertest';
import express, { Application } from 'express';
import { responseFormatter } from '../../../src/middleware/response-formatter';
import authRoutes from '../../../src/routes/auth.routes';
import { authService } from '../../../src/services/auth.service';

jest.mock('../../../src/services/auth.service');
jest.mock('../../../src/middleware/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
  AuthRequest: class {},
}));

describe('Auth Routes', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(responseFormatter);
    app.use('/api/auth', authRoutes);
  });

  describe('POST /api/auth/login', () => {
    it('returns token on successful login', async () => {
      const mockResult = {
        token: 'jwt-token',
        user: { id: 1, username: 'admin', gmlevel: 3 },
      };
      (authService.login as jest.Mock).mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'password' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: mockResult,
      });
    });

    it('returns 401 on invalid credentials', async () => {
      (authService.login as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 on missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns current user', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
