import request from 'supertest';
import express, { Application } from 'express';
import { responseFormatter } from '../../../src/middleware/response-formatter';
import healthRoutes from '../../../src/routes/health.routes';

describe('GET /api/health', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.use(responseFormatter);
    app.use('/api/health', healthRoutes);
  });

  it('returns health status', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { status: 'ok' },
    });
  });
});
