import { characterRepository } from '@/repositories/character.repository';
import { auditLogRepository } from '@/repositories/audit-log.repository';
import { logger } from '@/middleware/request-logger';
import { auditLogService } from './audit-log.service';
import { soapService } from './soap.service';
import { MAIL_TEMPLATES, WARNING_MAIL_TEMPLATE, renderTemplate, type MailTemplate } from '@/config/mail-template';

// GM 工具（SOAP 通道）：广播 + 违规提醒邮件（T4.4，需求 3.10）。
// `.send mail #playername "#subject" "#text"`（AC security level 2）；正文经 XML 与
// 命令层双重转义；照发不拦截离线目标（T0.4 已实测：离线角色 worldserver 受理入邮箱，
// 回执"邮件寄给 X"；不存在角色回执错误关键词，失败隔离不阻塞其他目标）。

export interface MailSendInput {
  targets: string[];
  subject: string;
  body: string;
  source: 'template' | 'custom';
  refReport?: string;
  reason?: string;
  reportDate?: string;
  operatorId: number;
  operatorName: string;
}

export interface MailTargetResult {
  name: string;
  guid: number | null;
  online: boolean | null;
  ok: boolean;
  message: string;
}

// AC 命令参数单行 + 双引号切分：引号换行会破坏语法，正文先归一化
function sanitizeCommandArg(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/"/g, "'");
}

// worldserver 回执含 &#xD; 等实体残留，解码后再展示
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// RA 回执：从 SOAP 响应 XML 提取 <result> 文本；空回执视为已受理
function extractResultText(xml: string): string {
  const match = /<result>([\s\S]*?)<\/result>/i.exec(xml);
  return decodeXmlEntities(match?.[1] ?? '').trim();
}

function isReceiptError(text: string): boolean {
  return /ACErr|not found|不存在|错误|error/i.test(text);
}

export interface MailLogItem {
  id: number;
  operatorName: string;
  createdAt: Date;
  characterName: string;
  subject: string;
  body: string;
  source: string;
  online: boolean | null;
  ok: boolean;
  result: string;
  refReport: string | null;
}

export class GmToolService {
  async broadcast(message: string): Promise<void> {
    await soapService.sendCommand(`.announce ${message}`);
  }

  get warningTemplate(): MailTemplate {
    return WARNING_MAIL_TEMPLATE;
  }

  get templates(): typeof MAIL_TEMPLATES {
    return MAIL_TEMPLATES;
  }

  renderMailTemplate(subject: string, body: string, vars: { player: string; reason: string; date: string }): MailTemplate {
    return renderTemplate({ subject, body }, vars);
  }

  // 发送记录查询：审计行（逐目标一行）解析回结构化条目；details 损坏降级空对象不阻塞列表
  async mailLogs(page = 1, pageSize = 20, filter?: string): Promise<{ items: MailLogItem[]; total: number }> {
    const { items, total } = await auditLogRepository.listByOperation('gmtool.mail.send', (page - 1) * pageSize, pageSize, filter?.trim() || undefined);
    return {
      total,
      items: items.map((row) => {
        let d: Partial<Omit<MailLogItem, 'id' | 'operatorName' | 'createdAt'>> = {};
        try {
          d = row.details ? JSON.parse(row.details) : {};
        } catch {
          logger.warn(`[gm-tool] mail log details parse failed, id=${row.id}`);
        }
        return {
          id: row.id,
          operatorName: row.operatorName,
          createdAt: row.createdAt,
          characterName: d.characterName ?? row.target,
          subject: d.subject ?? '',
          body: d.body ?? '',
          source: d.source ?? 'custom',
          online: d.online ?? null,
          ok: Boolean(d.ok),
          result: d.result ? decodeXmlEntities(d.result).trim() : '',
          refReport: d.refReport ?? null,
        };
      }),
    };
  }

  async sendMail(input: MailSendInput): Promise<{ results: MailTargetResult[] }> {
    const subject = input.subject.trim();
    const body = input.body.trim();
    if (!subject || subject.length > 100) throw new Error('邮件标题须为 1-100 字');
    if (!body || body.length > 500) throw new Error('邮件正文不得超过 500 字');
    if (input.targets.length === 0) throw new Error('发送目标不能为空');

    const names = [...new Set(input.targets.map((t) => t.trim()).filter(Boolean))];
    const basics = await characterRepository.findBasicByNames(names).catch(() => []);
    const byName = new Map(basics.map((b) => [b.name, b]));

    const results: MailTargetResult[] = [];
    for (const name of names) {
      const basic = byName.get(name);
      // GM 编辑的是含占位符的模板文本：逐目标渲染 {player}/{reason}/{date} 后发送
      const rendered = renderTemplate({ subject, body }, { player: name, reason: input.reason ?? '', date: input.reportDate ?? '' });
      const result = await this.sendToTarget(name, basic, rendered, input);
      results.push(result);
    }
    return { results };
  }

  private async sendToTarget(
    name: string,
    basic: { guid: number; name: string; accountId: number; accountUsername: string | null; online: number } | undefined,
    tpl: MailTemplate,
    input: MailSendInput,
  ): Promise<MailTargetResult> {
    const base: MailTargetResult = {
      name,
      guid: basic?.guid ?? null,
      online: basic ? basic.online === 1 : null,
      ok: false,
      message: '',
    };
    let resultText = '';
    try {
      if (!basic) throw new Error('角色不存在');
      const command = `.send mail ${basic.name} "${sanitizeCommandArg(tpl.subject)}" "${sanitizeCommandArg(tpl.body)}"`;
      const raw = await soapService.sendCommand(command);
      resultText = extractResultText(raw);
      base.ok = !isReceiptError(resultText);
      base.message = resultText || '已受理';
    } catch (err) {
      base.message = (err as Error).message || 'SOAP 命令失败';
    }
    await this.auditSend(base, tpl, input, resultText).catch((err: unknown) =>
      logger.error(`[gm-tool] mail audit failed: ${(err as Error).message}`),
    );
    return base;
  }

  private async auditSend(
    result: MailTargetResult,
    tpl: MailTemplate,
    input: MailSendInput,
    resultText: string,
  ): Promise<void> {
    await auditLogService.record({
      operatorId: input.operatorId,
      operatorName: input.operatorName,
      operation: 'gmtool.mail.send',
      target: result.guid != null ? `guid:${result.guid}` : `name:${result.name}`,
      details: JSON.stringify({
        characterName: result.name,
        subject: tpl.subject,
        body: tpl.body,
        source: input.source,
        online: result.online,
        result: resultText || result.message,
        ok: result.ok,
        ...(input.refReport ? { refReport: input.refReport } : {}),
      }),
    });
  }
}

export const gmToolService = new GmToolService();
