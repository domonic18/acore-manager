import request from 'supertest';
import express, { Application } from 'express';
import { responseFormatter } from '@/middleware/response-formatter';
import gmToolRoutes from '@/routes/gm-tool.routes';
import { gmToolService } from '@/services/gm-tool.service';

jest.mock('@/services/gm-tool.service');
jest.mock('@/middleware/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
  AuthRequest: class {},
}));
jest.mock('@/middleware/gm-guard', () => ({
  requireGmLevel: (_level: number) => (_req: any, _res: any, next: any) => next(),
}));

const VALID_MAIL = {
  targets: ['Unparalleled', 'Treepress'],
  subject: '违规警告',
  body: '正文内容',
  source: 'template',
  refReport: 'realm3:2026-08-22',
};

describe('GM Tool Routes', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(responseFormatter);
    app.use('/api/gm', gmToolRoutes);
  });

  describe('POST /api/gm/broadcast', () => {
    it('sends broadcast message', async () => {
      (gmToolService.broadcast as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/gm/broadcast')
        .send({ message: 'Server restart in 5 minutes' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(gmToolService.broadcast).toHaveBeenCalledWith('Server restart in 5 minutes');
    });
  });

  describe('GET /api/gm/mail/template', () => {
    it('returns the placeholder template', async () => {
      Object.defineProperty(gmToolService, 'warningTemplate', {
        get: jest.fn().mockReturnValue({ subject: '【警告】{player}', body: '{player} {reason} {date}' }),
        configurable: true,
      });
      const res = await request(app).get('/api/gm/mail/template');

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ subject: '【警告】{player}', body: '{player} {reason} {date}' });
    });
  });

  describe('GET /api/gm/mail/templates', () => {
    it('returns the preset template list', async () => {
      Object.defineProperty(gmToolService, 'templates', {
        get: jest.fn().mockReturnValue([
          { key: 'warning', name: '通用违规警告', subject: '【警告】{player}', body: '{reason}' },
          { key: 'cheating', name: '作弊警告', subject: '【警告】作弊行为', body: '亲爱的 {player}' },
        ]),
        configurable: true,
      });
      const res = await request(app).get('/api/gm/mail/templates');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).toMatchObject({ key: 'warning', name: '通用违规警告' });
    });
  });

  describe('POST /api/gm/mail', () => {
    it('returns per-target results', async () => {
      (gmToolService.sendMail as jest.Mock).mockResolvedValueOnce({
        results: [
          { name: 'Unparalleled', guid: 11140, online: true, ok: true, message: '已受理' },
          { name: 'Ghost', guid: null, online: null, ok: false, message: '角色不存在' },
        ],
      });
      const res = await request(app).post('/api/gm/mail').send(VALID_MAIL);

      expect(res.status).toBe(200);
      expect(res.body.data.results).toHaveLength(2);
      expect(gmToolService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ targets: VALID_MAIL.targets, source: 'template', refReport: 'realm3:2026-08-22' }),
      );
    });

    it('rejects empty targets and an over-500-char body with 400', async () => {
      const empty = await request(app).post('/api/gm/mail').send({ ...VALID_MAIL, targets: [] });
      expect(empty.status).toBe(400);

      const long = await request(app).post('/api/gm/mail').send({ ...VALID_MAIL, body: 'a'.repeat(501) });
      expect(long.status).toBe(400);
      expect(gmToolService.sendMail).not.toHaveBeenCalled();
    });

    it('rejects an invalid source and over-50 targets with 400', async () => {
      const badSource = await request(app).post('/api/gm/mail').send({ ...VALID_MAIL, source: 'auto' });
      expect(badSource.status).toBe(400);

      const tooMany = await request(app)
        .post('/api/gm/mail')
        .send({ ...VALID_MAIL, targets: Array.from({ length: 51 }, (_, i) => `p${i}`) });
      expect(tooMany.status).toBe(400);
    });
  });

  describe('GET /api/gm/mail/logs', () => {
    it('returns paginated per-target mail log items with total', async () => {
      (gmToolService.mailLogs as jest.Mock).mockResolvedValueOnce({
        items: [{ id: 15, operatorName: 'DEADWALK', characterName: 'Unparalleled', ok: true }],
        total: 1,
      });

      const res = await request(app).get('/api/gm/mail/logs?page=2&target=Unparalleled');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(gmToolService.mailLogs).toHaveBeenCalledWith(2, 20, 'Unparalleled');
    });

    it('rejects a non-numeric page and an over-100-char target with 400', async () => {
      const badPage = await request(app).get('/api/gm/mail/logs?page=abc');
      expect(badPage.status).toBe(400);

      const longTarget = await request(app).get(`/api/gm/mail/logs?target=${'a'.repeat(101)}`);
      expect(longTarget.status).toBe(400);
      expect(gmToolService.mailLogs).not.toHaveBeenCalled();
    });
  });
});
