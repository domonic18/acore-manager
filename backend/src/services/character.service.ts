import { cacheService } from './cache.service';
import { soapService } from './soap.service';
import { logger } from '@/middleware/request-logger';
import { characterRepository } from '@/repositories/character.repository';
import { auditLogService } from './audit-log.service';
import { sanitizeCommandArg, extractResultText, isReceiptError } from '@/shared/soap-command';
import { itemService } from './item.service';
import { ITEM_DISPLAY_INFO } from '@/generated/itemDisplayInfo';

export interface CharacterListItem {
  guid: number;
  name: string;
  accountId: number;
  accountUsername: string;
  race: number;
  class: number;
  gender: number;
  level: number;
  online: number;
  zone: number;
}

export interface CharacterBanRecord {
  banDate: Date;
  unbanDate: Date;
  bannedBy: string;
  banReason: string;
  active: number;
}

export interface CharacterDetail extends CharacterListItem {
  xp: number;
  money: number;
  map: number;
  positionX: number;
  positionY: number;
  positionZ: number;
  totalTime: number;
  arenaPoints: number;
  totalHonorPoints: number;
  totalKills: number;
  bans: CharacterBanRecord[];
}

export interface CharacterListResult {
  items: CharacterListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CharacterInventoryItem {
  itemGuid: number;
  bag: number;
  slot: number;
  itemEntry: number;
  count: number;
  displayId: number;
  containerSlots: number;
  quality: number;
  name: string;
  icon: string | null;
}

export interface AdminMailItemInput {
  entry: number;
  count: number;
}

export interface AdminMailInput {
  subject: string;
  body: string;
  items: AdminMailItemInput[];
  money: { gold: number; silver: number; copper: number };
}

export interface MailReceipt {
  type: 'items' | 'money';
  ok: boolean;
  message: string;
}

// 单封邮件附件硬上限与金币上限（AC MAX_MAIL_ITEMS=12；铜板总量须在 int32 内，
// 99999g = 999,990,000 copper，留足余量避免溢出变负导致扣钱）
export const ADMIN_MAIL_MAX_ITEMS = 12;
export const ADMIN_MAIL_MAX_COPPER = 999_990_000;

export interface AdminMailHistoryItem {
  id: number;
  subject: string;
  body: string;
  money: number;
  hasItems: boolean;
  read: boolean;
  deliverTime: Date;
  expireTime: Date;
  items: { itemEntry: number; count: number; displayId: number; quality: number; name: string; icon: string | null }[];
}

export class CharacterService {
  async listCharacters(
    page: number = 1,
    pageSize: number = 20,
    search?: string,
    includeDeleted: boolean = false,
    online?: boolean,
  ): Promise<CharacterListResult> {
    const cacheKey = `characters:list:${page}:${pageSize}:${search || ''}:${includeDeleted}:${online ? 1 : 0}`;
    const cached = await cacheService.get<CharacterListResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const offset = (page - 1) * pageSize;
    const conditions: string[] = [];
    const params: any[] = [];

    if (!includeDeleted) {
      conditions.push("name != ''");
    }
    if (search) {
      conditions.push('name LIKE ?');
      params.push(`%${search}%`);
    }
    if (online) {
      // acore_auth.account 同名 online 列存在，JOIN 查询必须带 c. 前缀消歧
      conditions.push('c.online = 1');
    }

    const { items, total } = await characterRepository.listCharacters(offset, pageSize, conditions, params);

    const result: CharacterListResult = {
      items: items.map((item: any) => ({
        guid: item.guid,
        name: item.name,
        accountId: item.accountId,
        accountUsername: item.accountUsername || '-',
        race: item.race,
        class: item.class,
        gender: item.gender,
        level: item.level,
        online: item.online,
        zone: item.zone,
      })),
      total,
      page,
      pageSize,
    };

    await cacheService.set(cacheKey, result, 60);
    return result;
  }

  // 邮件目标联想（GM 工具）：前缀搜索角色名，轻量列表
  async suggestNames(prefix: string, limit = 8): Promise<string[]> {
    return characterRepository.suggestNames(prefix, limit);
  }

  async getCharacterBanRecords(guid: number): Promise<CharacterBanRecord[]> {
    const result = await characterRepository.getCharacterBanRecords(guid);

    return result.map((item: any) => ({
      banDate: new Date(item.banDate * 1000),
      unbanDate: new Date(item.unbanDate * 1000),
      bannedBy: item.bannedBy,
      banReason: item.banReason,
      active: item.active,
    }));
  }

  // 角色物品（装备/背包/银行）：只读全量 inventory 行 + displayid→图标名映射，Redis 缓存 60s
  async getCharacterInventory(guid: number): Promise<CharacterInventoryItem[]> {
    const cacheKey = `character:inventory:${guid}`;
    const cached = await cacheService.get<CharacterInventoryItem[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const rows = await characterRepository.getCharacterInventory(guid);
    const result: CharacterInventoryItem[] = rows.map((row: any) => ({
      itemGuid: row.itemGuid,
      bag: row.bag,
      slot: row.slot,
      itemEntry: row.itemEntry,
      count: row.count,
      displayId: row.displayId,
      containerSlots: row.containerSlots,
      quality: row.quality,
      name: row.name,
      icon: ITEM_DISPLAY_INFO[row.displayId] ?? null,
    }));

    await cacheService.set(cacheKey, result, 60);
    return result;
  }

  async getCharacterDetail(guid: number): Promise<CharacterDetail | null> {
    const item = await characterRepository.getCharacterDetail(guid);

    if (!item) {
      return null;
    }

    const bans = await this.getCharacterBanRecords(guid);

    return {
      guid: item.guid,
      name: item.name,
      accountId: item.accountId,
      accountUsername: item.accountUsername || '-',
      race: item.race,
      class: item.class,
      gender: item.gender,
      level: item.level,
      xp: item.xp,
      money: item.money,
      online: item.online,
      zone: item.zone,
      map: item.map,
      positionX: item.positionX,
      positionY: item.positionY,
      positionZ: item.positionZ,
      totalTime: item.totalTime,
      arenaPoints: item.arenaPoints,
      totalHonorPoints: item.totalHonorPoints,
      totalKills: item.totalKills,
      bans,
    };
  }

  async unbanCharacter(guid: number, operatorId: number): Promise<void> {
    const detail = await this.getCharacterDetail(guid);
    if (!detail) {
      logger.error({ guid }, 'Character not found for unban');
      throw new Error('Character not found');
    }

    try {
      await soapService.sendCommand(`.unban character ${detail.name}`);
      await cacheService.delPattern('characters:*');
      await cacheService.del('banlist:active');
      logger.info({ guid, operatorId, name: detail.name }, 'Character unban command sent');
    } catch (error) {
      logger.error({ error, guid, name: detail.name }, 'Failed to send character unban command');
      throw new Error('Failed to unban character', { cause: error });
    }
  }

  async banCharacter(
    guid: number,
    operatorId: number,
    duration: string,
    reason: string,
  ): Promise<void> {
    const detail = await this.getCharacterDetail(guid);
    if (!detail) {
      logger.error({ guid }, 'Character not found for ban');
      throw new Error('Character not found');
    }

    try {
      await soapService.sendCommand(`.ban character ${detail.name} ${duration} ${reason}`);
      await cacheService.delPattern('characters:*');
      await cacheService.del('banlist:active');
      logger.info(
        { guid, operatorId, name: detail.name, duration, reason },
        'Character ban command sent',
      );
    } catch (error) {
      logger.error({ error, guid, name: detail.name }, 'Failed to send character ban command');
      throw new Error('Failed to ban character', { cause: error });
    }
  }

  async muteCharacter(
    guid: number,
    operatorId: number,
    duration: string,
    reason: string,
  ): Promise<void> {
    const detail = await this.getCharacterDetail(guid);
    if (!detail) {
      logger.error({ guid }, 'Character not found for mute');
      throw new Error('Character not found');
    }

    try {
      await soapService.sendCommand(`.mute ${detail.name} ${duration} ${reason}`);
      await cacheService.delPattern('characters:*');
      await cacheService.del('mute:active');
      logger.info(
        { guid, operatorId, name: detail.name, duration, reason },
        'Character mute command sent',
      );
    } catch (error) {
      logger.error({ error, guid, name: detail.name }, 'Failed to send character mute command');
      throw new Error('Failed to mute character', { cause: error });
    }
  }

  async unmuteCharacter(guid: number, operatorId: number): Promise<void> {
    const detail = await this.getCharacterDetail(guid);
    if (!detail) {
      logger.error({ guid }, 'Character not found for unmute');
      throw new Error('Character not found');
    }

    try {
      await soapService.sendCommand(`.unmute ${detail.name}`);
      await cacheService.delPattern('characters:*');
      await cacheService.del('mute:active');
      logger.info({ guid, operatorId, name: detail.name }, 'Character unmute command sent');
    } catch (error) {
      logger.error({ error, guid, name: detail.name }, 'Failed to send character unmute command');
      throw new Error('Failed to unmute character', { cause: error });
    }
  }

  // 踢下线（AC 原生 .kick，经 SOAP）：仅在线玩家生效；回执解析 + 审计，与 GM 工具同一 ok/message 约定
  async kickCharacter(
    guid: number,
    operatorId: number,
    operatorName: string,
    reason?: string,
  ): Promise<{ ok: boolean; message: string }> {
    const detail = await this.getCharacterDetail(guid);
    if (!detail) {
      logger.error({ guid }, 'Character not found for kick');
      throw new Error('Character not found');
    }
    if (detail.online !== 1) {
      throw new Error('角色不在线，无法踢下线');
    }

    const base: { ok: boolean; message: string } = { ok: false, message: '' };
    let resultText = '';
    try {
      const reasonArg = reason?.trim() ? ` ${sanitizeCommandArg(reason.trim())}` : '';
      const raw = await soapService.sendCommand(`.kick ${detail.name}${reasonArg}`);
      resultText = extractResultText(raw);
      base.ok = !isReceiptError(resultText);
      base.message = resultText || '已受理';
    } catch (err) {
      base.message = (err as Error).message || 'SOAP 命令失败';
    }

    await auditLogService
      .record({
        operatorId,
        operatorName,
        operation: 'character.kick',
        target: `guid:${guid}`,
        details: JSON.stringify({
          characterName: detail.name,
          reason: reason?.trim() || '',
          online: detail.online === 1,
          result: resultText || base.message,
          ok: base.ok,
        }),
      })
      .catch((err: unknown) => logger.error(`[character] kick audit failed: ${(err as Error).message}`));

    if (base.ok) {
      // 踢下线后角色 online 状态变化，列表/详情缓存需失效
      await cacheService.delPattern('characters:*').catch(() => {});
    }
    return base;
  }

  // 单向私信：在线走 `.send message`（聊天区红色管理员提示），离线降级 `.send mail` 入邮箱。
  // 玩家回复闭环（邮件轮询）暂缓，见 2026-10 需求评估
  async messageCharacter(
    guid: number,
    operatorId: number,
    operatorName: string,
    message: string,
  ): Promise<{ ok: boolean; message: string; channel: 'chat' | 'mail' }> {
    const detail = await this.getCharacterDetail(guid);
    if (!detail) {
      logger.error({ guid }, 'Character not found for message');
      throw new Error('Character not found');
    }

    const text = sanitizeCommandArg(message.trim());
    const online = detail.online === 1;
    const base: { ok: boolean; message: string; channel: 'chat' | 'mail' } = { ok: false, message: '', channel: online ? 'chat' : 'mail' };
    let resultText = '';
    try {
      const command = online
        ? `.send message ${detail.name} ${text}`
        : `.send mail ${detail.name} "管理员消息" "${text}"`;
      const raw = await soapService.sendCommand(command);
      resultText = extractResultText(raw);
      base.ok = !isReceiptError(resultText);
      base.message = resultText || '已受理';
    } catch (err) {
      base.message = (err as Error).message || 'SOAP 命令失败';
    }

    await auditLogService
      .record({
        operatorId,
        operatorName,
        operation: 'character.message',
        target: `guid:${guid}`,
        details: JSON.stringify({
          characterName: detail.name,
          channel: base.channel,
          content: message.trim(),
          result: resultText || base.message,
          ok: base.ok,
        }),
      })
      .catch((err: unknown) => logger.error(`[character] message audit failed: ${(err as Error).message}`));

    return base;
  }

  // 管理员发件（物品/金币）：AC 原生 .send items / .send money 经 SOAP，gmlevel≥2 + 审计。
  // items 与 money 同时存在时发两封邮件（AC 单封不支持两者兼附）；
  // 发送不可撤回（回收已暂缓），故拆堆/上限校验前置到发送前，失败即 400 不触达 worldserver
  async sendAdminMail(
    guid: number,
    input: AdminMailInput,
    operatorId: number,
    operatorName: string,
  ): Promise<{ ok: boolean; receipts: MailReceipt[] }> {
    const detail = await this.getCharacterDetail(guid);
    if (!detail) {
      throw new Error('Character not found');
    }

    const subject = (input.subject || '').trim();
    const body = (input.body || '').trim();
    if (!subject || subject.length > 100) throw new Error('邮件标题须为 1-100 字');
    if (body.length > 500) throw new Error('邮件正文不得超过 500 字');

    const gold = input.money?.gold ?? 0;
    const silver = input.money?.silver ?? 0;
    const copper = input.money?.copper ?? 0;
    if (![gold, silver, copper].every((v) => Number.isInteger(v) && v >= 0)) throw new Error('金币数额须为非负整数');
    if (silver > 99 || copper > 99 || gold > 99999) throw new Error('金币数额越界（金≤99999，银/铜<100）');
    const totalCopper = gold * 10000 + silver * 100 + copper;
    if (totalCopper > ADMIN_MAIL_MAX_COPPER) throw new Error('单封邮件金币总额超限');

    const items = input.items || [];
    if (items.length === 0 && totalCopper === 0) throw new Error('至少需附带物品或金币');

    // 拆堆：AC 按 MaxStackSize 自动拆分，此处按同规则预算格数，超 12 格直接拒绝
    const entries = [...new Set(items.map((i) => i.entry))];
    const templates = await itemService.getItemsByEntries(entries);
    const pairs: { entry: number; count: number }[] = [];
    for (const item of items) {
      const tpl = templates.get(item.entry);
      if (!tpl) throw new Error(`物品 ID ${item.entry} 不存在`);
      if (!Number.isInteger(item.count) || item.count < 1 || item.count > 1000) throw new Error(`物品 ${tpl.name} 数量须为 1-1000`);
      if (tpl.maxCount > 0 && item.count > tpl.maxCount) throw new Error(`唯一物品「${tpl.name}」单件持有上限 ${tpl.maxCount}，数量超出将被拒收`);
      const stack = tpl.stackable > 0 ? tpl.stackable : 1;
      let remaining = item.count;
      while (remaining > 0) {
        const take = Math.min(remaining, stack);
        pairs.push({ entry: item.entry, count: take });
        remaining -= take;
        if (pairs.length > ADMIN_MAIL_MAX_ITEMS) throw new Error(`附件合计超过 ${ADMIN_MAIL_MAX_ITEMS} 格上限`);
      }
    }

    const safeSubject = sanitizeCommandArg(subject);
    const safeBody = sanitizeCommandArg(body) || ' ';
    const receipts: MailReceipt[] = [];
    try {
      if (pairs.length > 0) {
        const itemList = pairs.map((p) => `${p.entry}:${p.count}`).join(' ');
        const raw = await soapService.sendCommand(
          `.send items ${detail.name} "${safeSubject}" "${safeBody}" ${itemList}`,
        );
        const message = extractResultText(raw);
        receipts.push({ type: 'items', ok: !isReceiptError(message), message: message || '已受理' });
      }
      if (totalCopper > 0) {
        const raw = await soapService.sendCommand(
          `.send money ${detail.name} "${safeSubject}" "${safeBody}" ${totalCopper}`,
        );
        const message = extractResultText(raw);
        receipts.push({ type: 'money', ok: !isReceiptError(message), message: message || '已受理' });
      }
    } catch (err) {
      receipts.push({ type: receipts.length === 0 ? 'items' : 'money', ok: false, message: (err as Error).message || 'SOAP 命令失败' });
    }

    const ok = receipts.every((r) => r.ok);
    await auditLogService
      .record({
        operatorId,
        operatorName,
        operation: 'character.mail_item',
        target: `guid:${guid}`,
        details: JSON.stringify({
          characterName: detail.name,
          subject,
          body,
          items: pairs.map((p) => ({ entry: p.entry, count: p.count, name: templates.get(p.entry)?.name ?? '' })),
          money: { gold, silver, copper, totalCopper },
          receipts,
          ok,
        }),
      })
      .catch((err: unknown) => logger.error(`[character] admin mail audit failed: ${(err as Error).message}`));

    return { ok, receipts };
  }

  // 管理员发件记录（角色详情页独立区块）：items 空 + has_items=1 即附件已领取；
  // 已读 = checked & 1（玩家客户端打开邮件时置位）
  async getAdminMails(guid: number): Promise<AdminMailHistoryItem[]> {
    const mails = await characterRepository.getAdminMails(guid);
    if (mails.length === 0) return [];

    const itemRows = await characterRepository.getMailItems(mails.map((m: any) => m.id));
    const itemsByMail = new Map<number, any[]>();
    for (const row of itemRows) {
      const list = itemsByMail.get(row.mailId) ?? [];
      list.push({
        itemEntry: row.itemEntry,
        count: row.count,
        displayId: row.displayId,
        quality: row.quality,
        name: row.name,
        icon: ITEM_DISPLAY_INFO[row.displayId] ?? null,
      });
      itemsByMail.set(row.mailId, list);
    }

    return mails.map((m: any) => ({
      id: m.id,
      subject: m.subject ?? '',
      body: m.body ?? '',
      money: m.money,
      hasItems: m.hasItems === 1,
      read: (m.checked & 1) !== 0,
      deliverTime: new Date(m.deliverTime * 1000),
      expireTime: new Date(m.expireTime * 1000),
      items: itemsByMail.get(m.id) ?? [],
    }));
  }
}

export const characterService = new CharacterService();
