import { charactersDataSource } from '@/config/database';

class CharacterRepository {
  async listCharacters(
    offset: number,
    pageSize: number,
    conditions: string[],
    params: any[],
  ): Promise<{ items: any[]; total: number }> {
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await charactersDataSource.query(
      `SELECT COUNT(*) as total FROM characters c ${whereClause}`,
      params,
    );
    const total = parseInt(countResult[0]?.total || '0', 10);

    const items = await charactersDataSource.query(
      `SELECT
        c.guid,
        c.name,
        c.account as accountId,
        a.username as accountUsername,
        c.race,
        c.class,
        c.gender,
        c.level,
        c.online,
        c.zone
      FROM characters c
      LEFT JOIN acore_auth.account a ON c.account = a.id
      ${whereClause}
      ORDER BY c.level DESC, c.name ASC
      LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    return { items, total };
  }

  async getCharacterDetail(guid: number): Promise<any | null> {
    const result = await charactersDataSource.query(
      `SELECT
        c.guid,
        c.name,
        c.account as accountId,
        a.username as accountUsername,
        c.race,
        c.class,
        c.gender,
        c.level,
        c.xp,
        c.money,
        c.online,
        c.zone,
        c.map,
        c.position_x as positionX,
        c.position_y as positionY,
        c.position_z as positionZ,
        c.totaltime as totalTime,
        c.arenaPoints,
        c.totalHonorPoints,
        c.totalKills
      FROM characters c
      LEFT JOIN acore_auth.account a ON c.account = a.id
      WHERE c.guid = ?`,
      [guid],
    );

    return result.length > 0 ? result[0] : null;
  }

  // 报告页可疑玩家富化（T4.3）与邮件目标校验（T4.4）：按名批量取 guid/账号/在线状态；已删除角色查不到，调用方降级
  async findBasicByNames(names: string[]): Promise<{ guid: number; name: string; accountId: number; accountUsername: string | null; online: number }[]> {
    if (names.length === 0) return [];
    const placeholders = names.map(() => '?').join(',');
    return charactersDataSource.query(
      `SELECT c.guid, c.name, c.account as accountId, a.username as accountUsername, c.online
       FROM characters c
       LEFT JOIN acore_auth.account a ON c.account = a.id
       WHERE c.name IN (${placeholders})`,
      names,
    );
  }

  // 邮件目标联想（GM 工具）：前缀匹配角色名，仅取名称列轻量返回
  async suggestNames(prefix: string, limit = 8): Promise<string[]> {
    const rows: { name: string }[] = await charactersDataSource.query(
      `SELECT c.name FROM characters c WHERE c.name LIKE ? ORDER BY c.name ASC LIMIT ?`,
      [`${prefix}%`, limit],
    );
    return rows.map((r) => r.name);
  }

  async getCharacterBanRecords(guid: number): Promise<any[]> {
    return charactersDataSource.query(
      `SELECT
        bandate as banDate,
        unbandate as unbanDate,
        bannedby as bannedBy,
        banreason as banReason,
        active
      FROM character_banned
      WHERE guid = ?
      ORDER BY bandate DESC`,
      [guid],
    );
  }

  // 角色物品查看（装备/背包/银行）：全量 character_inventory 行。bag=0 为主容器直放格，
  // bag>0 时值为父包物品 GUID（包内物品）；slot 语义见 AC Player.h：
  // 0-18 装备 / 19-22 已装备包位 / 23-38 背包格 / 39-66 银行格 / 67-70 银行包位
  async getCharacterInventory(guid: number): Promise<any[]> {
    return charactersDataSource.query(
      `SELECT
        ci.item AS itemGuid,
        ci.bag,
        ci.slot,
        ii.itemEntry,
        ii.count,
        it.displayid AS displayId,
        it.ContainerSlots AS containerSlots,
        it.Quality AS quality,
        COALESCE(loc.Name, it.name) AS name
      FROM character_inventory ci
      INNER JOIN item_instance ii ON ci.item = ii.guid
      INNER JOIN acore_world.item_template it ON ii.itemEntry = it.entry
      LEFT JOIN acore_world.item_template_locale loc ON it.entry = loc.ID AND loc.locale = 'zhCN'
      WHERE ci.guid = ?
      ORDER BY ci.bag ASC, ci.slot ASC`,
      [guid],
    );
  }

  // 管理员邮件识别（AC cs_send.cpp 控制台约定）：stationery=61（MAIL_STATIONERY_GM），
  // .send items 控制台发送 sender=收件人自己（寄给自己），.send money sender=0 → 两者并集；
  // 普通玩家邮件 sender 恒为真实 guid ≠ 0，无误伤
  async getAdminMails(guid: number, limit = 50): Promise<any[]> {
    return charactersDataSource.query(
      `SELECT
        m.id,
        m.subject,
        m.body,
        m.money,
        m.has_items AS hasItems,
        m.checked,
        m.deliver_time AS deliverTime,
        m.expire_time AS expireTime
      FROM mail m
      WHERE m.receiver = ? AND m.stationery = 61 AND (m.sender = m.receiver OR m.sender = 0)
      ORDER BY m.deliver_time DESC, m.id DESC
      LIMIT ?`,
      [guid, limit],
    );
  }

  async getMailItems(mailIds: number[]): Promise<any[]> {
    if (mailIds.length === 0) return [];
    const placeholders = mailIds.map(() => '?').join(',');
    return charactersDataSource.query(
      `SELECT
        mi.mail_id AS mailId,
        ii.itemEntry,
        ii.count,
        it.displayid AS displayId,
        it.Quality AS quality,
        COALESCE(loc.Name, it.name) AS name
      FROM mail_items mi
      INNER JOIN item_instance ii ON mi.item_guid = ii.guid
      INNER JOIN acore_world.item_template it ON ii.itemEntry = it.entry
      LEFT JOIN acore_world.item_template_locale loc ON it.entry = loc.ID AND loc.locale = 'zhCN'
      WHERE mi.mail_id IN (${placeholders})`,
      mailIds,
    );
  }
}

export const characterRepository = new CharacterRepository();
