jest.mock('@/services/soap.service');
jest.mock('@/services/audit-log.service', () => ({
  auditLogService: { record: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/repositories/audit-log.repository', () => ({
  auditLogRepository: { listByOperation: jest.fn() },
}));
jest.mock('@/repositories/character.repository', () => ({
  characterRepository: { findBasicByNames: jest.fn().mockResolvedValue([]) },
}));
jest.mock('@/middleware/request-logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { gmToolService } from '@/services/gm-tool.service';
import { soapService } from '@/services/soap.service';
import { auditLogService } from '@/services/audit-log.service';
import { auditLogRepository } from '@/repositories/audit-log.repository';
import { characterRepository } from '@/repositories/character.repository';

const sendCommand = soapService.sendCommand as jest.Mock;
const record = auditLogService.record as jest.Mock;
const findBasicByNames = characterRepository.findBasicByNames as jest.Mock;
const listByOperation = auditLogRepository.listByOperation as jest.Mock;

const OPERATOR = { operatorId: 753, operatorName: 'DEADWALK' };

function mailInput(overrides: Record<string, unknown> = {}) {
  return {
    targets: ['Unparalleled'],
    subject: '违规警告',
    body: '正文内容 {player}',
    source: 'template' as const,
    ...OPERATOR,
    ...overrides,
  };
}

describe('GmToolService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('broadcast', () => {
    it('sends announce SOAP command', async () => {
      (soapService.sendCommand as jest.Mock).mockResolvedValue('OK');

      await gmToolService.broadcast('Server maintenance in 10 minutes');

      expect(soapService.sendCommand).toHaveBeenCalledWith('.announce Server maintenance in 10 minutes');
    });

    it('propagates SOAP errors', async () => {
      (soapService.sendCommand as jest.Mock).mockRejectedValue(new Error('SOAP timeout'));

      await expect(gmToolService.broadcast('test')).rejects.toThrow('SOAP timeout');
    });
  });

  describe('sendMail', () => {
    beforeEach(() => {
      sendCommand.mockResolvedValue('<result></result>');
      findBasicByNames.mockResolvedValue([
        { guid: 11140, name: 'Unparalleled', accountId: 4604, accountUsername: 'HY2038', online: 1 },
        { guid: 11084, name: 'Treepress', accountId: 4604, accountUsername: 'HY2038', online: 0 },
      ]);
    });

    it('builds a quoted single-line .send mail command and reports success per target', async () => {
      const { results } = await gmToolService.sendMail(mailInput({ body: '第一行\n"引用" 第二行' }));

      expect(sendCommand).toHaveBeenCalledTimes(1);
      expect(sendCommand).toHaveBeenCalledWith('.send mail Unparalleled "违规警告" "第一行 \'引用\' 第二行"');
      expect(results[0]).toMatchObject({ name: 'Unparalleled', guid: 11140, online: true, ok: true, message: '已受理' });
    });

    it('renders {player}/{reason}/{date} placeholders per target before sending', async () => {
      await gmToolService.sendMail(
        mailInput({
          targets: ['Unparalleled', 'Treepress'],
          body: '亲爱的 {player}：{date} 检测到 {reason}，请立即停止。',
          reason: '加速违规',
          reportDate: '2026-08-22',
        }),
      );

      expect(sendCommand).toHaveBeenNthCalledWith(1, expect.stringContaining('.send mail Unparalleled "违规警告" "亲爱的 Unparalleled：2026-08-22 检测到 加速违规，请立即停止。"'));
      expect(sendCommand).toHaveBeenNthCalledWith(2, expect.stringContaining('.send mail Treepress "违规警告" "亲爱的 Treepress：2026-08-22 检测到 加速违规，请立即停止。"'));
    });

    it('isolates a failing target without affecting the others', async () => {
      sendCommand.mockRejectedValueOnce(new Error('SOAP timeout'));
      const { results } = await gmToolService.sendMail(mailInput({ targets: ['Unparalleled', 'Treepress'] }));

      expect(sendCommand).toHaveBeenCalledTimes(2);
      expect(results[0]).toMatchObject({ name: 'Unparalleled', ok: false, message: 'SOAP timeout' });
      expect(results[1]).toMatchObject({ name: 'Treepress', ok: true });
    });

    it('fails a missing character locally and still audits the attempt', async () => {
      const { results } = await gmToolService.sendMail(mailInput({ targets: ['GhostName'] }));

      expect(sendCommand).not.toHaveBeenCalled();
      expect(results[0]).toMatchObject({ name: 'GhostName', guid: null, online: null, ok: false, message: '角色不存在' });
      expect(record).toHaveBeenCalledWith(expect.objectContaining({ operation: 'gmtool.mail.send', target: 'name:GhostName' }));
    });

    it('marks a receipt containing an error keyword as failed', async () => {
      sendCommand.mockResolvedValueOnce('<result>Player Unparalleled not found!</result>');
      const { results } = await gmToolService.sendMail(mailInput());

      expect(results[0]).toMatchObject({ ok: false, message: 'Player Unparalleled not found!' });
    });

    it('audits every send with operation, guid target and full content details', async () => {
      await gmToolService.sendMail(mailInput({ refReport: 'realm3:2026-08-22' }));

      expect(record).toHaveBeenCalledTimes(1);
      const arg = record.mock.calls[0][0];
      expect(arg).toMatchObject({ operatorId: 753, operatorName: 'DEADWALK', operation: 'gmtool.mail.send', target: 'guid:11140' });
      const details = JSON.parse(arg.details);
      expect(details).toMatchObject({
        characterName: 'Unparalleled',
        subject: '违规警告',
        source: 'template',
        online: true,
        ok: true,
        refReport: 'realm3:2026-08-22',
      });
    });

    it('rejects an over-500-char body and an over-100-char subject before any SOAP call', async () => {
      await expect(gmToolService.sendMail(mailInput({ body: 'a'.repeat(501) }))).rejects.toThrow('500');
      await expect(gmToolService.sendMail(mailInput({ subject: 'a'.repeat(101) }))).rejects.toThrow('100');
      expect(sendCommand).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
    });
  });

  describe('warningTemplate', () => {
    it('exposes the template with placeholder variables and renders them', () => {
      const tpl = gmToolService.warningTemplate;
      expect(tpl.subject).toContain('警告');
      expect(tpl.body).toContain('{player}');
      expect(tpl.body).toContain('{reason}');
      expect(tpl.body).toContain('{date}');

      const rendered = gmToolService.renderMailTemplate(tpl.subject, tpl.body, { player: '张三', reason: '加速违规', date: '2026-09-23' });
      expect(rendered.subject).not.toContain('{');
      expect(rendered.body).toContain('张三');
      expect(rendered.body).toContain('加速违规');
      expect(rendered.body).toContain('2026-09-23');
    });
  });

  describe('mailLogs', () => {
    it('parses audit details JSON into structured items and falls back on corrupt details', async () => {
      listByOperation.mockResolvedValueOnce({
        items: [
          {
            id: 15,
            operatorName: 'DEADWALK',
            createdAt: new Date('2026-09-23T12:00:00Z'),
            target: 'guid:11140',
            details: JSON.stringify({
              characterName: 'Unparalleled',
              subject: '违规警告',
              body: '正文',
              source: 'template',
              online: true,
              result: '邮件寄给 Unparalleled',
              ok: true,
              refReport: 'realm3:2026-08-22',
            }),
          },
          { id: 14, operatorName: 'DEADWALK', createdAt: new Date('2026-09-23T11:00:00Z'), target: 'name:Ghost', details: 'not-json' },
        ],
        total: 2,
      });

      const res = await gmToolService.mailLogs(2, 20, 'Unparalleled');

      expect(listByOperation).toHaveBeenCalledWith('gmtool.mail.send', 20, 20, 'Unparalleled');
      expect(res.total).toBe(2);
      expect(res.items[0]).toMatchObject({
        id: 15,
        characterName: 'Unparalleled',
        subject: '违规警告',
        ok: true,
        online: true,
        result: '邮件寄给 Unparalleled',
        refReport: 'realm3:2026-08-22',
      });
      // 损坏 details 降级：target 兜底 characterName，其余字段空值
      expect(res.items[1]).toMatchObject({ id: 14, characterName: 'name:Ghost', subject: '', ok: false, refReport: null });
    });
  });
});
