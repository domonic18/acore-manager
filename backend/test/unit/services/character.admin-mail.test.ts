import { characterService } from '@/services/character.service';
import { characterRepository } from '@/repositories/character.repository';
import { itemService } from '@/services/item.service';
import { cacheService } from '@/services/cache.service';
import { soapService } from '@/services/soap.service';
import { auditLogService } from '@/services/audit-log.service';

jest.mock('@/repositories/character.repository');
jest.mock('@/services/item.service');
jest.mock('@/services/cache.service');
jest.mock('@/services/soap.service');
jest.mock('@/services/audit-log.service');
jest.mock('@/middleware/request-logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const OK_XML = '<xml><result>Mail sent to Hero</result></xml>';

function mockCharacterDetail(overrides: Record<string, unknown> = {}) {
  (characterRepository.getCharacterDetail as jest.Mock).mockResolvedValue({
    guid: 7,
    name: 'Hero',
    online: 1,
    ...overrides,
  });
  (characterRepository.getCharacterBanRecords as jest.Mock).mockResolvedValue([]);
  (cacheService.get as jest.Mock).mockResolvedValue(null);
}

function mockTemplates(entries: Record<number, { name: string; stackable: number; maxCount?: number }>) {
  const map = new Map();
  for (const [entry, tpl] of Object.entries(entries)) {
    map.set(Number(entry), { name: tpl.name, stackable: tpl.stackable, maxCount: tpl.maxCount ?? 0 });
  }
  (itemService.getItemsByEntries as jest.Mock).mockResolvedValue(map);
}

describe('CharacterService.sendAdminMail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (soapService.sendCommand as jest.Mock).mockResolvedValue(OK_XML);
    (auditLogService.record as jest.Mock).mockResolvedValue(undefined);
  });

  const base = { subject: '补偿', body: '运维补偿', money: { gold: 0, silver: 0, copper: 0 }, items: [] };

  it('角色不存在抛错且不发命令', async () => {
    (characterRepository.getCharacterDetail as jest.Mock).mockResolvedValue(null);
    (cacheService.get as jest.Mock).mockResolvedValue(null);

    await expect(characterService.sendAdminMail(7, { ...base, items: [{ entry: 1, count: 1 }] }, 1, 'gm')).rejects.toThrow(
      'Character not found',
    );
    expect(soapService.sendCommand).not.toHaveBeenCalled();
  });

  it('空标题 / 无附件无金币 / 金币越界均 400 拒绝', async () => {
    mockCharacterDetail();

    await expect(characterService.sendAdminMail(7, { ...base, subject: '' }, 1, 'gm')).rejects.toThrow('邮件标题');
    await expect(characterService.sendAdminMail(7, base, 1, 'gm')).rejects.toThrow('至少需附带物品或金币');
    await expect(
      characterService.sendAdminMail(7, { ...base, money: { gold: 100000, silver: 0, copper: 0 } }, 1, 'gm'),
    ).rejects.toThrow('越界');
    await expect(
      characterService.sendAdminMail(7, { ...base, money: { gold: 0, silver: 100, copper: 0 } }, 1, 'gm'),
    ).rejects.toThrow('越界');
    expect(soapService.sendCommand).not.toHaveBeenCalled();
  });

  it('物品 ID 不存在 / MaxCount 超限 / 拆堆超 12 格均拒绝', async () => {
    mockCharacterDetail();

    (itemService.getItemsByEntries as jest.Mock).mockResolvedValue(new Map());
    await expect(characterService.sendAdminMail(7, { ...base, items: [{ entry: 999, count: 1 }] }, 1, 'gm')).rejects.toThrow(
      '不存在',
    );

    mockTemplates({ 6948: { name: '月光之瓶', stackable: 20, maxCount: 1 } });
    await expect(
      characterService.sendAdminMail(7, { ...base, items: [{ entry: 6948, count: 2 }] }, 1, 'gm'),
    ).rejects.toThrow('上限');

    mockTemplates({ 1: { name: '碎屑', stackable: 1 } });
    await expect(
      characterService.sendAdminMail(7, { ...base, items: [{ entry: 1, count: 13 }] }, 1, 'gm'),
    ).rejects.toThrow('12 格上限');
    expect(soapService.sendCommand).not.toHaveBeenCalled();
  });

  it('物品+金币发两封邮件：items 按堆叠拆分，money 传铜板整数，审计带回执', async () => {
    mockCharacterDetail();
    mockTemplates({ 6948: { name: '月光之瓶', stackable: 20, maxCount: 0 } });

    const { ok, receipts } = await characterService.sendAdminMail(
      7,
      {
        subject: '补偿',
        body: '运维补偿',
        items: [{ entry: 6948, count: 45 }],
        money: { gold: 1, silver: 2, copper: 3 },
      },
      1,
      'gm',
    );

    expect(ok).toBe(true);
    expect(receipts).toHaveLength(2);
    const [itemsCmd, moneyCmd] = (soapService.sendCommand as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(itemsCmd).toContain('.send items Hero "补偿" "运维补偿" 6948:20 6948:20 6948:5');
    expect(moneyCmd).toContain('.send money Hero "补偿" "运维补偿" 10203');

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'character.mail_item',
        target: 'guid:7',
      }),
    );
    const details = JSON.parse((auditLogService.record as jest.Mock).mock.calls[0][0].details);
    expect(details.items).toEqual([
      { entry: 6948, count: 20, name: '月光之瓶' },
      { entry: 6948, count: 20, name: '月光之瓶' },
      { entry: 6948, count: 5, name: '月光之瓶' },
    ]);
    expect(details.money.totalCopper).toBe(10203);
    expect(details.ok).toBe(true);
  });

  it('回执含错误关键词时 ok=false 仍审计', async () => {
    mockCharacterDetail();
    mockTemplates({ 6948: { name: '月光之瓶', stackable: 20 } });
    (soapService.sendCommand as jest.Mock).mockResolvedValue('<xml><result>Item not found</result></xml>');

    const { ok } = await characterService.sendAdminMail(7, { ...base, items: [{ entry: 6948, count: 1 }] }, 1, 'gm');

    expect(ok).toBe(false);
    expect(auditLogService.record).toHaveBeenCalled();
    const details = JSON.parse((auditLogService.record as jest.Mock).mock.calls[0][0].details);
    expect(details.ok).toBe(false);
  });
});

describe('CharacterService.getAdminMails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('空列表短路不查附件', async () => {
    (characterRepository.getAdminMails as jest.Mock).mockResolvedValue([]);
    await expect(characterService.getAdminMails(7)).resolves.toEqual([]);
    expect(characterRepository.getMailItems).not.toHaveBeenCalled();
  });

  it('映射已读位掩码 / 附件已领取 / 图标名', async () => {
    (characterRepository.getAdminMails as jest.Mock).mockResolvedValue([
      { id: 1, subject: '补偿', body: 'x', money: 10203, hasItems: 1, checked: 1, deliverTime: 1700000000, expireTime: 1702600000 },
      { id: 2, subject: '道具', body: '', money: 0, hasItems: 1, checked: 4, deliverTime: 1700000001, expireTime: 1702600001 },
    ]);
    (characterRepository.getMailItems as jest.Mock).mockResolvedValue([
      { mailId: 2, itemEntry: 6948, count: 3, displayId: 1234, quality: 3, name: '月光之瓶' },
    ]);

    const mails = await characterService.getAdminMails(7);

    expect(characterRepository.getMailItems).toHaveBeenCalledWith([1, 2]);
    expect(mails[0]).toMatchObject({ id: 1, read: true, hasItems: true, items: [] });
    expect(mails[1].read).toBe(false); // checked=4 仅 COPIED 位，未读
    expect(mails[1].items[0]).toMatchObject({ itemEntry: 6948, count: 3, icon: null });
    expect(mails[0].deliverTime).toEqual(new Date(1700000000 * 1000));
  });
});
