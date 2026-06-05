import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { accountRepository } from '../repositories/account.repository';
import { verifySha1Password } from '../shared/utils/password.util';
import { logger } from '../middleware/request-logger';

export interface LoginResult {
  token: string;
  user: {
    id: number;
    username: string;
    gmlevel: number;
  };
}

export class AuthService {
  async login(username: string, password: string): Promise<LoginResult | null> {
    const account = await accountRepository.findByUsername(username);
    if (!account) {
      return null;
    }

    const isValid = verifySha1Password(
      username,
      password,
      account.shaPassHash,
    );

    if (!isValid) {
      logger.warn({ username }, 'Invalid password attempt');
      return null;
    }

    const gmlevel = await accountRepository.getGmLevel(account.id);

    if (gmlevel < 1) {
      logger.warn({ username, accountId: account.id }, 'User has insufficient GM level');
      return null;
    }

    const token = jwt.sign(
      { id: account.id, username: account.username, gmlevel },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN },
    );

    logger.info({ userId: account.id, username }, 'User logged in');

    return {
      token,
      user: {
        id: account.id,
        username: account.username,
        gmlevel,
      },
    };
  }
}

export const authService = new AuthService();
