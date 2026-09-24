jest.mock('@/services/ai/targeted-analysis.service', () => ({
  ServiceError: class ServiceError extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
  targetedAnalysisService: {
    stream: jest.fn(),
    list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    getById: jest.fn(),
    update: jest.fn().mockResolvedValue({ id: 77, gmRemark: 'ok' }),
    remove: jest.fn().mockResolvedValue(undefined),
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
import aiAnalysisRoutes from '@/routes/ai-analysis.routes';
import { ServiceError, targetedAnalysisService } from '@/services/ai/targeted-analysis.service';

const streamMock = targetedAnalysisService.stream as jest.Mock;

function fakeStream(events: { event: string; data: Record<string, unknown> }[]): AsyncGenerator<{ event: string; data: Record<string, unknown> }> {
  return (async function* () {
    for (const ev of events) yield ev;
  })();
}

const VALID_BODY = { realm: 'realm3', subjectType: 'character', subjectName: 'Unparalleled', timeFrom: '2026-08-16', timeTo: '2026-08-23' };

const DONE_EVENTS = [
  { event: 'delta', data: { text: '分析中' } },
  { event: 'done', data: { analysisId: 77, conclusion: { suggestion: 'maintain' }, tokens: { total: 15 } } },
];

describe('AI Analysis Routes: POST /targeted', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(responseFormatter);
    app.use('/api/ai/analysis', aiAnalysisRoutes);
  });

  it('aggregates a non-stream round into the full conclusion', async () => {
    streamMock.mockReturnValueOnce(fakeStream(DONE_EVENTS));
    const res = await request(app).post('/api/ai/analysis/targeted').send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ analysisId: 77, conclusion: { suggestion: 'maintain' } });
    expect(streamMock).toHaveBeenCalledWith(expect.objectContaining({ realm: 'realm3', subjectType: 'character', operatorName: '' }));
  });

  it('returns 502 when the stream yields an error event', async () => {
    streamMock.mockReturnValueOnce(fakeStream([{ event: 'error', data: { message: '两轮校验均未通过' } }]));
    const res = await request(app).post('/api/ai/analysis/targeted').send(VALID_BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toContain('两轮');
  });

  it('streams SSE frames when the client negotiates text/event-stream', async () => {
    streamMock.mockReturnValueOnce(fakeStream(DONE_EVENTS));
    const res = await request(app).post('/api/ai/analysis/targeted').set('Accept', 'text/event-stream').send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('event: delta');
    expect(res.text).toContain('event: done');
    expect(res.text).toContain('"analysisId":77');
  });

  it('rejects an invalid subjectType with 400', async () => {
    const res = await request(app).post('/api/ai/analysis/targeted').send({ ...VALID_BODY, subjectType: 'guild' });
    expect(res.status).toBe(400);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('rejects an inverted time range and an over-31d span with 400', async () => {
    const inverted = await request(app).post('/api/ai/analysis/targeted').send({ ...VALID_BODY, timeFrom: '2026-08-23', timeTo: '2026-08-16' });
    expect(inverted.status).toBe(400);

    const tooLong = await request(app).post('/api/ai/analysis/targeted').send({ ...VALID_BODY, timeFrom: '2026-01-01', timeTo: '2026-03-01' });
    expect(tooLong.status).toBe(400);
    expect(streamMock).not.toHaveBeenCalled();
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
