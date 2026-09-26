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
    listByGuids: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    remove: jest.fn(),
  },
}));
jest.mock('@/services/job-trigger.service', () => ({
  ServiceError: class ServiceError extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
  triggerJob: jest.fn().mockResolvedValue({ requestId: 'req-1' }),
}));
jest.mock('@/services/ai/report.service', () => ({
  reportService: {
    list: jest.fn().mockResolvedValue([]),
    getByRealmDate: jest.fn().mockResolvedValue(null),
    uploadStatus: jest.fn().mockResolvedValue([]),
    remove: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue({ realm: 'realm3', reportDate: '2026-08-23', gmRemark: '已复核' }),
  },
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
import { ServiceError as ReportedServiceError } from '@/services/ai/anticheat-exemption.service';
import { triggerJob, ServiceError as TriggerServiceError } from '@/services/job-trigger.service';
import { JOB_TASK } from '@/shared/enums/job-task';
import { reportService } from '@/services/ai/report.service';
import { anticheatExemptionService } from '@/services/ai/anticheat-exemption.service';

describe('AI Diagnosis Routes: manual inspection trigger', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    (triggerJob as jest.Mock).mockResolvedValue({ requestId: 'req-1' });
    app = express();
    app.use(express.json());
    app.use(responseFormatter);
    app.use('/api/ai/diagnosis', aiDiagnosisRoutes);
  });

  it('accepts a manual trigger with explicit realm and date via SCF invoke', async () => {
    const res = await request(app).post('/api/ai/diagnosis/inspection/trigger').send({ realm: 'realm3', date: '2026-08-22' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ accepted: true, requestId: 'req-1', realm: 'realm3', date: '2026-08-22' });
    expect(triggerJob).toHaveBeenCalledWith(JOB_TASK.INSPECTION, { realm: 'realm3', date: '2026-08-22', trigger: 'manual' });
  });

  it('passes omitted realm/date through for the task-side defaults', async () => {
    const res = await request(app).post('/api/ai/diagnosis/inspection/trigger').send({});

    expect(res.status).toBe(200);
    expect(triggerJob).toHaveBeenCalledWith(JOB_TASK.INSPECTION, { realm: undefined, trigger: 'manual' });
    expect(res.body.data).toEqual({ accepted: true, requestId: 'req-1', realm: null, date: null });
  });

  it('rejects an empty realm with 400 without triggering', async () => {
    const res = await request(app).post('/api/ai/diagnosis/inspection/trigger').send({ realm: '' });

    expect(res.status).toBe(400);
    expect(triggerJob).not.toHaveBeenCalled();
  });

  it('rejects a realm containing whitespace with 400 (argv-safe params)', async () => {
    const res = await request(app).post('/api/ai/diagnosis/inspection/trigger').send({ realm: 'realm 3' });

    expect(res.status).toBe(400);
    expect(triggerJob).not.toHaveBeenCalled();
  });

  it('rejects a malformed date with 400', async () => {
    const res = await request(app).post('/api/ai/diagnosis/inspection/trigger').send({ realm: 'realm3', date: '20260822' });
    expect(res.status).toBe(400);
    expect(triggerJob).not.toHaveBeenCalled();
  });

  it('maps trigger ServiceError status (e.g. 502 when SCF is unconfigured)', async () => {
    (triggerJob as jest.Mock).mockRejectedValueOnce(new TriggerServiceError('SCF 触发未配置：缺少环境变量 SCF_REGION（见 .env.example）', 502));
    const res = await request(app).post('/api/ai/diagnosis/inspection/trigger').send({ realm: 'realm3' });

    expect(res.status).toBe(502);
    expect(res.body.error).toContain('SCF_REGION');
  });
});

describe('AI Diagnosis Routes: report query (T4.1)', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(responseFormatter);
    app.use('/api/ai/diagnosis', aiDiagnosisRoutes);
  });

  it('lists reports with optional realm filter and count', async () => {
    (reportService.list as jest.Mock).mockResolvedValueOnce([{ id: 8, realm: 'realm3', reportDate: '2026-08-23' }]);
    const res = await request(app).get('/api/ai/diagnosis/reports?realm=realm3');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0]).toMatchObject({ id: 8 });
    expect(reportService.list).toHaveBeenCalledWith('realm3', undefined);
  });

  it('rejects an empty realm param with 400', async () => {
    const res = await request(app).get('/api/ai/diagnosis/reports?realm=');
    expect(res.status).toBe(400);
  });

  it('returns report detail for a valid realm/date', async () => {
    (reportService.getByRealmDate as jest.Mock).mockResolvedValueOnce({ id: 8, contentJson: {}, contentMarkdown: '# r' });
    const res = await request(app).get('/api/ai/diagnosis/reports/realm3/2026-08-23');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 8 });
    expect(reportService.getByRealmDate).toHaveBeenCalledWith('realm3', '2026-08-23');
  });

  it('returns 404 when the report is absent', async () => {
    const res = await request(app).get('/api/ai/diagnosis/reports/realm3/2026-08-23');
    expect(res.status).toBe(404);
  });

  it('rejects a malformed date param with 400', async () => {
    const res = await request(app).get('/api/ai/diagnosis/reports/realm3/20260823');
    expect(res.status).toBe(400);
    expect(reportService.getByRealmDate).not.toHaveBeenCalled();
  });

  it('returns the markdown raw body as text/plain (T4.2)', async () => {
    (reportService.getByRealmDate as jest.Mock).mockResolvedValueOnce({ id: 8, contentJson: {}, contentMarkdown: '# 巡检报告全文' });
    const res = await request(app).get('/api/ai/diagnosis/reports/realm3/2026-08-23/markdown');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toBe('# 巡检报告全文');
  });

  it('returns 404 for the markdown endpoint when the report is absent', async () => {
    const res = await request(app).get('/api/ai/diagnosis/reports/realm3/2026-08-23/markdown');
    expect(res.status).toBe(404);
  });

  it('returns upload status for the requested realm and days', async () => {
    (reportService.uploadStatus as jest.Mock).mockResolvedValueOnce([{ date: '2026-08-23', present: true, missingTypes: [] }]);
    const res = await request(app).get('/api/ai/diagnosis/upload-status?realm=realm3&days=7');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(reportService.uploadStatus).toHaveBeenCalledWith('realm3', 7);
  });

  it('rejects upload status without realm', async () => {
    const res = await request(app).get('/api/ai/diagnosis/upload-status');
    expect(res.status).toBe(400);
  });

  it('lists exemptions filtered by a comma-separated guids param (T4.3)', async () => {
    const res = await request(app).get('/api/ai/diagnosis/exemptions?guids=12, 34,abc,12');

    expect(res.status).toBe(200);
    expect(anticheatExemptionService.listByGuids).toHaveBeenCalledWith([12, 34]);
    expect(anticheatExemptionService.list).not.toHaveBeenCalled();
  });

  it('returns the violation type dictionary (T4.3)', async () => {
    const res = await request(app).get('/api/ai/diagnosis/exemptions/types');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toContain('speed');
  });

  it('deletes a report and reports 404 when absent', async () => {
    const res = await request(app).delete('/api/ai/diagnosis/reports/realm3/2026-08-23');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ success: true });
    expect(reportService.remove).toHaveBeenCalledWith('realm3', '2026-08-23', 0, '');

    (reportService.remove as jest.Mock).mockRejectedValueOnce(new ReportedServiceError('报告不存在', 404));
    const missing = await request(app).delete('/api/ai/diagnosis/reports/realm3/2026-08-23');
    expect(missing.status).toBe(404);
  });

  it('rejects delete with a malformed date', async () => {
    const res = await request(app).delete('/api/ai/diagnosis/reports/realm3/bad-date');
    expect(res.status).toBe(400);
    expect(reportService.remove).not.toHaveBeenCalled();
  });
});

describe('AI Diagnosis Routes: PUT /reports/:realm/:date (T4.7)', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(responseFormatter);
    app.use('/api/ai/diagnosis', aiDiagnosisRoutes);
  });

  it('updates remark/markdown and returns the row', async () => {
    const res = await request(app)
      .put('/api/ai/diagnosis/reports/realm3/2026-08-23')
      .send({ gmRemark: '已复核', contentMarkdown: '# 润色后' });
    expect(res.status).toBe(200);
    expect(reportService.update).toHaveBeenCalledWith(
      'realm3',
      '2026-08-23',
      { gmRemark: '已复核', contentMarkdown: '# 润色后' },
      0,
      '',
    );
  });

  it('rejects a malformed date and an over-long remark with 400', async () => {
    const badDate = await request(app).put('/api/ai/diagnosis/reports/realm3/bad-date').send({ gmRemark: 'x' });
    expect(badDate.status).toBe(400);

    const long = await request(app).put('/api/ai/diagnosis/reports/realm3/2026-08-23').send({ gmRemark: 'a'.repeat(1001) });
    expect(long.status).toBe(400);
    expect(reportService.update).not.toHaveBeenCalled();
  });

  it('maps ServiceError 404 when the report is absent', async () => {
    (reportService.update as jest.Mock).mockRejectedValueOnce(new ReportedServiceError('报告不存在', 404));
    const res = await request(app).put('/api/ai/diagnosis/reports/realm3/2001-01-01').send({ gmRemark: 'x' });
    expect(res.status).toBe(404);
  });
});
