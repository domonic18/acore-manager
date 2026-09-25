import request from 'supertest';
import express, { Application } from 'express';
import { responseFormatter } from '@/middleware/response-formatter';
import { dbReadinessGate } from '@/middleware/db-readiness-gate';

const mockGetServiceState = jest.fn();
const mockGetInitPromise = jest.fn();

jest.mock('@/config/database', () => ({
  getServiceState: () => mockGetServiceState(),
  getInitPromise: () => mockGetInitPromise(),
}));

function buildApp(): Application {
  const app = express();
  app.use(responseFormatter);
  app.use('/api', dbReadinessGate);
  app.get('/api/ping', (_req, res) => res.jsonSuccess({ pong: true }));
  app.get('/api/health', (_req, res) => res.jsonSuccess({ status: 'probe' }));
  app.get('/api/health/ready', (_req, res) => res.jsonSuccess({ state: 'probe' }));
  return app;
}

// 直接调用的桩：jsonError 形态与 response-formatter 挂载的行为一致
function stubRes() {
  const res = {
    set: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    jsonError: jest.fn(),
  };
  return res;
}

describe('dbReadinessGate', () => {
  let app: Application;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('passes through when ready', async () => {
    mockGetServiceState.mockReturnValue('ready');
    const res = await request(app).get('/api/ping');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ pong: true });
    expect(mockGetInitPromise).not.toHaveBeenCalled();
  });

  it('exempts /health and /health/* without state checks', async () => {
    mockGetServiceState.mockReturnValue('degraded');

    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body.data).toEqual({ status: 'probe' });

    const ready = await request(app).get('/api/health/ready');
    expect(ready.status).toBe(200);

    expect(mockGetServiceState).not.toHaveBeenCalled();
  });

  it('waits for init promise and passes through once ready', async () => {
    mockGetServiceState
      .mockReturnValueOnce('starting') // initial check
      .mockReturnValueOnce('starting') // after race (wait)
      .mockReturnValue('ready'); // readiness re-check
    mockGetInitPromise.mockResolvedValue(undefined);

    const res = await request(app).get('/api/ping');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ pong: true });
  });

  it('returns 503 DB_INITIALIZING with Retry-After when still starting after gate wait', async () => {
    // 直接调用中间件（不走 supertest）：假定时器与真实 socket I/O 相互干扰会导致请求挂起
    jest.useFakeTimers();
    mockGetServiceState.mockReturnValue('starting');
    mockGetInitPromise.mockReturnValue(new Promise<void>(() => {})); // never resolves

    const res = stubRes();
    const next = jest.fn();
    const handled = dbReadinessGate({ path: '/ping' } as never, res as never, next);

    await jest.advanceTimersByTimeAsync(8_000); // gate wait timeout fires
    await handled;

    expect(next).not.toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith('Retry-After', '2');
    expect(res.jsonError).toHaveBeenCalledWith(expect.stringContaining('初始化中'), 503, 'DB_INITIALIZING');
  });

  it('returns 503 DB_DEGRADED immediately with Retry-After 10', async () => {
    mockGetServiceState.mockReturnValue('degraded');

    const res = await request(app).get('/api/ping');

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('DB_DEGRADED');
    expect(res.headers['retry-after']).toBe('10');
    expect(res.body.error).toContain('暂不可用');
    expect(mockGetInitPromise).not.toHaveBeenCalled();
  });
});
