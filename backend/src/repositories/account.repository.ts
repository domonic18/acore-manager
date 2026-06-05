import { authDataSource } from '../config/database';
import { BaseRepository } from './base.repository';
import { Account } from '../entities/auth/account.entity';
import { AccountAccess } from '../entities/auth/account-access.entity';

class AccountRepository extends BaseRepository<Account> {
  constructor() {
    super(authDataSource, Account);
  }

  async findByUsername(username: string): Promise<Account | null> {
    return this.repo.findOne({ where: { username } });
  }

  async getGmLevel(accountId: number): Promise<number> {
    const access = await authDataSource
      .getRepository(AccountAccess)
      .findOne({ where: { accountId } });
    return access?.gmlevel ?? 0;
  }
}

export const accountRepository = new AccountRepository();
