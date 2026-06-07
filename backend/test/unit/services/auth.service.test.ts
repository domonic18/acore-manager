import jwt from 'jsonwebtoken';
import { authService } from '../../../src/services/auth.service';
import { accountRepository } from '../../../src/repositories/account.repository';
import { verifySRP6Password } from '../../../src/shared/utils/password.util';
import { logger } from '../../../src/middleware/request-logger';

jest.mock('../../../src/repositories/account.repository');
jest.mock('../../../src/shared/utils/password.util');
jest.mock('../../../src/middleware/request-logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));
jest.mock('jsonwebtoken');

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('returns null when account not found', async () => {
      (accountRepository.findByUsername as jest.Mock).mockResolvedValue(null);

      const result = await authService.login('unknown', 'password');

      expect(result).toBeNull();
    });

    it('returns null when password is invalid', async () => {
      (accountRepository.findByUsername as jest.Mock).mockResolvedValue({
        id: 1,
        username: 'test',
        salt: Buffer.alloc(32),
        verifier: Buffer.alloc(32),
      });
      (verifySRP6Password as jest.Mock).mockReturnValue(false);

      const result = await authService.login('test', 'wrong');

      expect(result).toBeNull();
    });

    it('returns null when GM level is insufficient', async () => {
      (accountRepository.findByUsername as jest.Mock).mockResolvedValue({
        id: 1,
        username: 'test',
        salt: Buffer.alloc(32),
        verifier: Buffer.alloc(32),
      });
      (verifySRP6Password as jest.Mock).mockReturnValue(true);
      (accountRepository.getGmLevel as jest.Mock).mockResolvedValue(0);

      const result = await authService.login('test', 'password');

      expect(result).toBeNull();
    });

    it('returns token and user on successful login', async () => {
      (accountRepository.findByUsername as jest.Mock).mockResolvedValue({
        id: 1,
        username: 'admin',
        salt: Buffer.alloc(32),
        verifier: Buffer.alloc(32),
      });
      (verifySRP6Password as jest.Mock).mockReturnValue(true);
      (accountRepository.getGmLevel as jest.Mock).mockResolvedValue(3);
      (jwt.sign as jest.Mock).mockReturnValue('mock-jwt-token');

      const result = await authService.login('admin', 'password');

      expect(result).toEqual({
        token: 'mock-jwt-token',
        user: { id: 1, username: 'admin', gmlevel: 3 },
      });
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: 1, username: 'admin', gmlevel: 3 },
        expect.any(String),
        { expiresIn: expect.any(String) },
      );
    });
  });
});
