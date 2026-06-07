import request from 'supertest';
import express, { Application } from 'express';
import { responseFormatter } from '../../../src/middleware/response-formatter';
import gmToolRoutes from '../../../src/routes/gm-tool.routes';
import { gmToolService } from '../../../src/services/gm-tool.service';

jest.mock('../../../src/services/gm-tool.service');
jest.mock('../../../src/middleware/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
  AuthRequest: class {},
}));
jest.mock('../../../src/middleware/gm-guard', () => ({
  requireGmLevel: (_level: number) => (_req: any, _res: any, next: any) => next(),
}));

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
});
