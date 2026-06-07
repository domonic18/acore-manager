import request from 'supertest';
import express, { Application } from 'express';
import { responseFormatter } from '../../../src/middleware/response-formatter';
import characterRoutes from '../../../src/routes/character.routes';
import { characterService } from '../../../src/services/character.service';

jest.mock('../../../src/services/character.service');
jest.mock('../../../src/middleware/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
  AuthRequest: class {},
}));
jest.mock('../../../src/middleware/gm-guard', () => ({
  requireGmLevel: (_level: number) => (_req: any, _res: any, next: any) => next(),
}));

describe('Character Routes', () => {
  let app: Application;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use(responseFormatter);
    app.use('/api/characters', characterRoutes);
  });

  describe('GET /api/characters', () => {
    it('returns character list', async () => {
      const mockData = {
        items: [{ guid: 1, name: 'Hero' }],
        total: 1,
        page: 1,
        pageSize: 20,
      };
      (characterService.listCharacters as jest.Mock).mockResolvedValue(mockData);

      const res = await request(app).get('/api/characters');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        count: 1,
        data: mockData,
      });
    });
  });

  describe('GET /api/characters/:guid', () => {
    it('returns character detail', async () => {
      const mockDetail = { guid: 1, name: 'Hero', bans: [] };
      (characterService.getCharacterDetail as jest.Mock).mockResolvedValue(mockDetail);

      const res = await request(app).get('/api/characters/1');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(mockDetail);
    });

    it('returns 404 when character not found', async () => {
      (characterService.getCharacterDetail as jest.Mock).mockResolvedValue(null);

      const res = await request(app).get('/api/characters/999');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/characters/:guid/ban', () => {
    it('bans a character', async () => {
      (characterService.banCharacter as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/characters/1/ban')
        .send({ duration: '1d', reason: '违规' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/characters/:guid/unban', () => {
    it('unbans a character', async () => {
      (characterService.unbanCharacter as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app).post('/api/characters/1/unban');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/characters/:guid/mute', () => {
    it('mutes a character', async () => {
      (characterService.muteCharacter as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/characters/1/mute')
        .send({ duration: '1h', reason: '恶意刷屏' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/characters/:guid/unmute', () => {
    it('unmutes a character', async () => {
      (characterService.unmuteCharacter as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app).post('/api/characters/1/unmute');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
