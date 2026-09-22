jest.mock('@/services/ai/anticheat-exemption.service', () => ({
  ServiceError: class ServiceError extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
  anticheatExemptionService: {
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    remove: jest.fn(),
  },
}));
jest.mock('@/services/ai/inspection.service', () => ({
  inspectionService: { run: jest.fn().mockResolvedValue({ ok: true }) },
}));
jest.mock('@/config/env', () => ({
  env: { LOG_LEVEL: 'silent', NODE_ENV: 'test' },
}));
jest.mock('@/middleware/request-logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@/middleware/auth', () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  AuthRequest: class {},
}));
jest.mock('@/middleware/gm-guard', () => ({
  requireGmLevel: (_level: number) => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import express, { Application } from 'express';
import request from 'supertest';
import { responseFormatter } from '@/middleware/response-formatter';
import aiDiagnosisRoutes from '@/routes/ai-diagnosis.routes';
import { inspectionService } from '@/services/ai/inspection.service';

describe('AI Diagnosis Routes: manual inspection trigger', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(responseFormatter);
    app.use('/api/ai/diagnosis', aiDiagnosisRoutes);
  });

  it('accepts a manual trigger with explicit realm and date', async () => {
    const res = await request(app).post('/api/ai/diagnosis/inspection/trigger').send({ realm: 'realm3', date: '2026-08-22' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ accepted: true, realm: 'realm3', date: '2026-08-22' });
    expect(inspectionService.run).toHaveBeenCalledWith({ realm: 'realm3', date: '2026-08-22', trigger: 'manual' });
  });

  it('defaults the date to yesterday when omitted', async () => {
    const res = await request(app).post('/api/ai/diagnosis/inspection/trigger').send({ realm: 'realm3' });

    expect(res.body.success).toBe(true);
    const call = (inspectionService.run as jest.Mock).mock.calls[0][0] as { date: string };
    expect(call.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(call.trigger).toBe('manual');
  });

  it('rejects an empty realm with 400 without entering the inspection flow', async () => {
    const res = await request(app).post('/api/ai/diagnosis/inspection/trigger').send({ realm: '' });

    expect(res.status).toBe(400);
    expect(inspectionService.run).not.toHaveBeenCalled();
  });

  it('rejects a malformed date with 400', async () => {
    const res = await request(app).post('/api/ai/diagnosis/inspection/trigger').send({ realm: 'realm3', date: '20260822' });
    expect(res.status).toBe(400);
  });

  it('responds immediately even when the background inspection fails', async () => {
    (inspectionService.run as jest.Mock).mockRejectedValueOnce(new Error('llm down'));
    const res = await request(app).post('/api/ai/diagnosis/inspection/trigger').send({ realm: 'realm3', date: '2026-08-22' });

    expect(res.status).toBe(200);
    expect(res.body.data.accepted).toBe(true);
  });
});
