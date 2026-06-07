import { authDataSource } from '../config/database';

class MuteRepository {
  async listActiveMutes(): Promise<any[]> {
    return authDataSource.query(
      `SELECT
        a.id as accountId,
        a.username,
        a.last_ip as lastIp,
        GROUP_CONCAT(c.name ORDER BY c.name SEPARATOR ',') as characterNames,
        CASE
          WHEN a.mutetime > 0 THEN FROM_UNIXTIME(a.mutetime)
          ELSE CONCAT('下次登录生效 (', ABS(a.mutetime), '秒)')
        END as muteTime,
        a.mutereason as muteReason,
        a.muteby as mutedBy
      FROM account a
      LEFT JOIN acore_characters.characters c ON c.account = a.id AND c.name != ''
      WHERE a.mutetime > UNIX_TIMESTAMP() OR a.mutetime < 0
      GROUP BY a.id, a.username, a.last_ip, a.mutetime, a.mutereason, a.muteby`,
    );
  }
}

export const muteRepository = new MuteRepository();
