jest.mock('@/services/ai/targeted-analysis.service', () => ({
  targetedAnalysisService: {
    createRecords: jest.fn().mockResolvedValue([{ id: 77 }]),
    list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    getById: jest.fn(),
    update: jest.fn().mockResolvedValue({ id: 77, gmRemark: 'ok' }),
    remove: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/services/abuse-patrol.service', () => ({
  abusePatrolService: {
    listFindings: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    updateFindingStatus: jest.fn().mockResolvedValue(null),
  },
}));
jest.mock('@/services/audit-log.service', () => ({
  auditLogService: { record: jest.fn().mockResolvedValue(undefined) },
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
import aiAnalysisRoutes from '@/routes/ai-analysis.routes';
import { ServiceError } from '@/shared/errors/service-error';
import { targetedAnalysisService } from '@/services/ai/targeted-analysis.service';
import { abusePatrolService } from '@/services/abuse-patrol.service';

const listFindingsMock = abusePatrolService.listFindings as jest.Mock;
const updateFindingStatusMock = abusePatrolService.updateFindingStatus as jest.Mock;

const createRecordsMock = targetedAnalysisService.createRecords as jest.Mock;

const VALID_BODY = {
  realm: 'realm3',
  subjectType: 'character',
  subjectNames: ['Unparalleled', 'Nolove'],
  timeFrom: '2026-08-16',
  timeTo: '2026-08-23',
};

describe('AI Analysis Routes: POST /targeted (async submission)', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(responseFormatter);
    app.use('/api/ai/analysis', aiAnalysisRoutes);
  });

  it('creates rows in batch and returns them with count', async () => {
    const res = await request(app).post('/api/ai/analysis/targeted').send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
    expect(res.body.data).toEqual([{ id: 77 }]);
    expect(createRecordsMock).toHaveBeenCalledWith(expect.objectContaining({ realm: 'realm3', subjectType: 'character', subjectNames: ['Unparalleled', 'Nolove'] }));
  });

  it('maps a duplicate running submission to 409', async () => {
    createRecordsMock.mockRejectedValueOnce(new ServiceError('以下对象存在进行中的分析，请等待完成后再提交：Unparalleled', 409));
    const res = await request(app).post('/api/ai/analysis/targeted').send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Unparalleled');
  });

  it('rejects an invalid subjectType with 400', async () => {
    const res = await request(app).post('/api/ai/analysis/targeted').send({ ...VALID_BODY, subjectType: 'guild' });
    expect(res.status).toBe(400);
    expect(createRecordsMock).not.toHaveBeenCalled();
  });

  it('rejects an empty or over-10 subject list with 400', async () => {
    const empty = await request(app).post('/api/ai/analysis/targeted').send({ ...VALID_BODY, subjectNames: [] });
    expect(empty.status).toBe(400);

    const tooMany = await request(app)
      .post('/api/ai/analysis/targeted')
      .send({ ...VALID_BODY, subjectNames: Array.from({ length: 11 }, (_, i) => `p${i}`) });
    expect(tooMany.status).toBe(400);
    expect(createRecordsMock).not.toHaveBeenCalled();
  });

  it('rejects an inverted time range and an over-31d span with 400', async () => {
    const inverted = await request(app).post('/api/ai/analysis/targeted').send({ ...VALID_BODY, timeFrom: '2026-08-23', timeTo: '2026-08-16' });
    expect(inverted.status).toBe(400);

    const tooLong = await request(app).post('/api/ai/analysis/targeted').send({ ...VALID_BODY, timeFrom: '2026-01-01', timeTo: '2026-03-01' });
    expect(tooLong.status).toBe(400);
    expect(createRecordsMock).not.toHaveBeenCalled();
  });
});

describe('AI Analysis Routes: GET /targeted (history)', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(responseFormatter);
    app.use('/api/ai/analysis', aiAnalysisRoutes);
  });

  it('lists history with paging and total count', async () => {
    (targetedAnalysisService.list as jest.Mock).mockResolvedValueOnce({ items: [{ id: 77, status: 'ok' }], total: 1 });
    const res = await request(app).get('/api/ai/analysis/targeted?page=1&pageSize=10&subjectName=Unpar');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0]).toMatchObject({ id: 77 });
    expect(targetedAnalysisService.list).toHaveBeenCalledWith(1, 10, 'Unpar');
  });

  it('rejects an over-sized pageSize with 400', async () => {
    const res = await request(app).get('/api/ai/analysis/targeted?pageSize=100');
    expect(res.status).toBe(400);
  });

  it('returns detail by id and maps ServiceError to its status', async () => {
    (targetedAnalysisService.getById as jest.Mock).mockResolvedValueOnce({ id: 77, conclusionMarkdown: '# r' });
    const ok = await request(app).get('/api/ai/analysis/targeted/77');
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ id: 77 });

    (targetedAnalysisService.getById as jest.Mock).mockRejectedValueOnce(new ServiceError('定向分析记录不存在', 404));
    const missing = await request(app).get('/api/ai/analysis/targeted/999');
    expect(missing.status).toBe(404);
  });
});

describe('AI Analysis Routes: PUT/DELETE /targeted/:id (T4.7)', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(responseFormatter);
    app.use('/api/ai/analysis', aiAnalysisRoutes);
  });

  it('updates remark/markdown and returns the row', async () => {
    const res = await request(app).put('/api/ai/analysis/targeted/77').send({ gmRemark: '复核通过', conclusionMarkdown: '# polished' });
    expect(res.status).toBe(200);
    expect(targetedAnalysisService.update).toHaveBeenCalledWith(
      77,
      { gmRemark: '复核通过', conclusionMarkdown: '# polished' },
      0,
      '',
    );
  });

  it('rejects a bad id and an over-long remark with 400', async () => {
    const badId = await request(app).put('/api/ai/analysis/targeted/abc').send({ gmRemark: 'x' });
    expect(badId.status).toBe(400);

    const long = await request(app).put('/api/ai/analysis/targeted/77').send({ gmRemark: 'a'.repeat(1001) });
    expect(long.status).toBe(400);
    expect(targetedAnalysisService.update).not.toHaveBeenCalled();
  });

  it('maps update/remove ServiceError to its status', async () => {
    (targetedAnalysisService.update as jest.Mock).mockRejectedValueOnce(new ServiceError('定向分析记录不存在', 404));
    const upd = await request(app).put('/api/ai/analysis/targeted/999').send({ gmRemark: 'x' });
    expect(upd.status).toBe(404);

    (targetedAnalysisService.remove as jest.Mock).mockRejectedValueOnce(new ServiceError('定向分析记录不存在', 404));
    const del = await request(app).delete('/api/ai/analysis/targeted/999');
    expect(del.status).toBe(404);
  });

  it('deletes a record with success payload', async () => {
    const res = await request(app).delete('/api/ai/analysis/targeted/77');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ success: true });
    expect(targetedAnalysisService.remove).toHaveBeenCalledWith(77, 0, '');
  });
});

describe('AI Analysis Routes: /patrol-findings (violation patrol)', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(responseFormatter);
    app.use('/api/ai/analysis', aiAnalysisRoutes);
  });

  it('lists findings with filters, paging and total count', async () => {
    listFindingsMock.mockResolvedValueOnce({ items: [{ id: 5, findingType: 'bg_honor_farm', status: 'open' }], total: 1 });

    const res = await request(app).get('/api/ai/analysis/patrol-findings?date=2026-10-03&type=bg_honor_farm&status=open&page=2&pageSize=10');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0]).toMatchObject({ id: 5 });
    expect(listFindingsMock).toHaveBeenCalledWith({ date: '2026-10-03', type: 'bg_honor_farm', status: 'open' }, 2, 10);
  });

  it('rejects an invalid type and a malformed date with 400', async () => {
    const badType = await request(app).get('/api/ai/analysis/patrol-findings?type=honor_farm');
    expect(badType.status).toBe(400);

    const badDate = await request(app).get('/api/ai/analysis/patrol-findings?date=20261003');
    expect(badDate.status).toBe(400);
    expect(listFindingsMock).not.toHaveBeenCalled();
  });

  it('transitions a finding status and returns the row', async () => {
    updateFindingStatusMock.mockResolvedValueOnce({ id: 5, status: 'actioned', findingType: 'hardcore_carry', dedupeKey: 'k1' });

    const res = await request(app).post('/api/ai/analysis/patrol-findings/5/status').send({ status: 'actioned' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: 5, status: 'actioned' });
    expect(updateFindingStatusMock).toHaveBeenCalledWith(5, 'actioned');
  });

  it('returns 404 for a missing finding and 400 for a bad status', async () => {
    const missing = await request(app).post('/api/ai/analysis/patrol-findings/999/status').send({ status: 'actioned' });
    expect(missing.status).toBe(404);

    const badStatus = await request(app).post('/api/ai/analysis/patrol-findings/5/status').send({ status: 'closed' });
    expect(badStatus.status).toBe(400);
    // 仅 999 那次真正触达 service（返回 null → 404）；badStatus 被校验拦截
    expect(updateFindingStatusMock).toHaveBeenCalledTimes(1);
    expect(updateFindingStatusMock).toHaveBeenCalledWith(999, 'actioned');
  });
});
