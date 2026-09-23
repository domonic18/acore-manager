import { z } from 'zod';
import { registerTool } from '@/agent/tools/registry';
import { runReadOnly } from './query-guard';

// 账号域白名单工具（需求 3.5）：account 表敏感列（salt/verifier/session_key/totp_secret/restore_key）
// 永不出现在 SELECT 列表中——显式列白名单，禁用 SELECT *。

const ACCOUNT_COLUMNS = 'id, username, email, joindate, last_ip, last_login, failed_logins, locked, online, os, recruiter';

export function registerAccountTools(): void {
  registerTool({
    name: 'get_account_overview',
    description: '按账号 ID 或用户名查询账号概况（邮箱/注册时间/最近 IP/失败登录/锁定/在线），并附带生效中的封禁与禁言记录。',
    schema: z
      .object({
        accountId: z.number().int().positive().optional().describe('账号 ID'),
        username: z.string().min(2).optional().describe('用户名（不区分大小写）'),
      })
      .refine((v) => v.accountId !== undefined || v.username !== undefined, { message: 'accountId 与 username 至少提供一个' }),
    handler: async (args) => {
      const { accountId, username } = args as { accountId?: number; username?: string };
      const accounts =
        accountId !== undefined
          ? await runReadOnly('auth', `SELECT ${ACCOUNT_COLUMNS} FROM account WHERE id = ? LIMIT 1`, [accountId])
          : await runReadOnly('auth', `SELECT ${ACCOUNT_COLUMNS} FROM account WHERE username = UPPER(?) LIMIT 1`, [username]);
      const ids = accounts.rows.map((r) => r.id as number);
      if (ids.length === 0) return { accounts: [], activeBans: [], activeMutes: [] };
      const ph = ids.map(() => '?').join(',');
      const bans = await runReadOnly(
        'auth',
        `SELECT id, bandate, unbandate, bannedby, banreason FROM account_banned WHERE id IN (${ph}) AND active = 1 ORDER BY bandate DESC LIMIT 50`,
        ids,
      );
      const mutes = await runReadOnly(
        'auth',
        `SELECT guid, mutedate, mutetime, mutedby, mutereason FROM account_muted WHERE guid IN (${ph}) AND mutetime > UNIX_TIMESTAMP() ORDER BY mutetime DESC LIMIT 10`,
        ids,
      );
      return { accounts: accounts.rows, activeBans: bans.rows, activeMutes: mutes.rows };
    },
  });

  registerTool({
    name: 'get_login_ip_history',
    description: '查询账号的登录 IP 历史（首次/最近登录时间），按最近登录倒序。',
    schema: z.object({
      accountId: z.number().int().positive().describe('账号 ID'),
      limit: z.number().int().min(1).max(50).default(20).describe('返回条数上限'),
    }),
    handler: async (args) => {
      const { accountId, limit } = args as { accountId: number; limit: number };
      return runReadOnly(
        'auth',
        `SELECT account, ip, first_time, last_time FROM account_ip WHERE account = ? ORDER BY last_time DESC LIMIT ${limit}`,
        [accountId],
      );
    },
  });

  registerTool({
    name: 'get_accounts_by_ip',
    description: '按 IP 反查关联账号：account_ip 登录历史匹配 + account.last_ip 最近登录匹配，两路结果并列返回（用于多开/代练排查）。',
    schema: z.object({ ip: z.string().min(7).max(45).describe('IP 地址（IPv4/IPv6）') }),
    handler: async (args) => {
      const { ip } = args as { ip: string };
      const [viaHistory, viaLastIp] = await Promise.all([
        runReadOnly(
          'auth',
          `SELECT ai.account, ai.ip, ai.first_time, ai.last_time, a.username
           FROM account_ip ai JOIN account a ON a.id = ai.account
           WHERE ai.ip = ? ORDER BY ai.last_time DESC LIMIT 50`,
          [ip],
        ),
        runReadOnly('auth', 'SELECT id, username, last_login, last_ip FROM account WHERE last_ip = ? LIMIT 50', [ip]),
      ]);
      return { viaHistory: viaHistory.rows, viaLastIp: viaLastIp.rows };
    },
  });

  registerTool({
    name: 'get_ban_history',
    description: '查询账号或角色的历史封禁记录（封禁/解封时间/操作人/原因/是否生效）。',
    schema: z.object({
      scope: z.enum(['account', 'character']).describe('封禁对象类型'),
      id: z.number().int().positive().describe('账号 ID 或角色 guid'),
      includeInactive: z.boolean().default(true).describe('是否包含已解封记录'),
    }),
    handler: async (args) => {
      const { scope, id, includeInactive } = args as { scope: 'account' | 'character'; id: number; includeInactive: boolean };
      const table = scope === 'account' ? 'account_banned' : 'character_banned';
      const column = scope === 'account' ? 'id' : 'guid';
      return runReadOnly(
        scope === 'account' ? 'auth' : 'characters',
        `SELECT ${column} AS target, bandate, unbandate, bannedby, banreason, active
         FROM ${table}
         WHERE ${column} = ?${includeInactive ? '' : ' AND active = 1'}
         ORDER BY bandate DESC LIMIT 50`,
        [id],
      );
    },
  });
}
