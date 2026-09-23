import { createHmac } from 'crypto';
import { env } from '@/config/env';
import { logger } from '@/middleware/request-logger';
import type { InspectionReportJson } from './inspection.service';
import type { InspectionInput } from './inspection.service';

// 飞书群机器人 webhook 通知，AI 域告警统一出口（Token 预算超限 / 巡检失败 / 日志断传等）。
// 未配置 FEISHU_WEBHOOK_URL 时仅记日志；任何失败都不阻塞业务主链路。
// 机器人安全设置为"签名校验"时需配 FEISHU_WEBHOOK_SECRET：
// sign = HMAC-SHA256(key = `${timestamp}\n${secret}`, message = '') → base64。

type FeishuCard = Record<string, unknown>;
type FeishuPayload = Record<string, unknown>;

export type DailyReportCardInput = Pick<InspectionInput, 'realm' | 'date' | 'trigger'> &
  Pick<InspectionReportJson, 'healthScore' | 'summary' | 'serverHealth' | 'suspiciousPlayers' | 'recommendations'>;

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;
const SEVERITY_LABEL = { high: '高危', medium: '中危', low: '低危' } as const;

class FeishuNotifyService {
  async sendText(text: string): Promise<boolean> {
    return this.post({ msg_type: 'text', content: { text } }, `notify: ${text.slice(0, 120)}`);
  }

  async sendCard(card: FeishuCard): Promise<boolean> {
    return this.post({ msg_type: 'interactive', card }, 'card notify');
  }

  private async post(payload: FeishuPayload, label: string): Promise<boolean> {
    if (!env.FEISHU_WEBHOOK_URL) {
      logger.warn(`[feishu] webhook not configured, skip ${label}`);
      return false;
    }
    if (env.FEISHU_WEBHOOK_SECRET) {
      const timestamp = Math.floor(Date.now() / 1000);
      const sign = createHmac('sha256', `${timestamp}\n${env.FEISHU_WEBHOOK_SECRET}`).update('').digest('base64');
      payload.timestamp = timestamp;
      payload.sign = sign;
    }
    try {
      const resp = await fetch(env.FEISHU_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) {
        logger.error(`[feishu] ${label} failed: HTTP ${resp.status}`);
        return false;
      }
      // webhook 2xx 也会带业务错误码（如签名不符 code=19021），需检查 body
      const body = (await resp.json()) as { code?: number; msg?: string };
      if (body.code && body.code !== 0) {
        logger.error(`[feishu] ${label} rejected: code=${body.code} msg=${body.msg}`);
        return false;
      }
      return true;
    } catch (err) {
      logger.error(`[feishu] ${label} error: ${(err as Error).message}`);
      return false;
    }
  }

  buildDailyReportCard(input: DailyReportCardInput): FeishuCard {
    const { realm, date, healthScore } = input;
    const crashes = input.serverHealth.crashes?.length ?? 0;
    const errors = input.serverHealth.errors?.length ?? 0;
    const authAnomalies = input.serverHealth.authAnomalies?.length ?? 0;
    const suspicious = input.suspiciousPlayers.length;

    const top = [...input.suspiciousPlayers]
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
      .slice(0, 3);
    const risky = top.some((p) => p.severity === 'high') || healthScore < 60;

    const elements: FeishuCard[] = [
      {
        tag: 'div',
        fields: [
          this.field('健康分', String(healthScore)),
          this.field('可疑玩家', `${suspicious} 名`),
          this.field('崩溃', String(crashes)),
          this.field('错误', String(errors)),
          this.field('认证异常', String(authAnomalies)),
        ],
      },
      { tag: 'hr' },
    ];

    // 每名玩家一个结构化块：风险级别 → 处置 → 误报信号 → 首条依据，替代整段 summary 文字
    if (top.length === 0) {
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: '**本日无可疑玩家**' } });
    }
    for (const p of top) {
      const fp = p.falsePositiveSignals?.length ?? 0;
      const lines = [
        `**【${SEVERITY_LABEL[p.severity] ?? p.severity}】${p.character}**　建议处置：**${p.suggestedAction}**`,
      ];
      if (fp > 0) lines.push(`误报信号 ${fp} 项（不建议直接封禁）`);
      lines.push(`依据：${(p.reasons?.[0] ?? '').slice(0, 90)}`);
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: lines.join('\n') } });
    }
    if (input.recommendations?.length) {
      elements.push({ tag: 'hr' });
      elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: `**处置建议**\n${input.recommendations.slice(0, 2).map((r) => `- ${r.slice(0, 90)}`).join('\n')}` },
      });
    }

    // 报告页由 T4.0 提供；配置了基础地址才渲染跳转按钮
    if (env.ACM_WEB_BASE_URL) {
      elements.push({
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '查看完整报告' },
            type: 'primary',
            url: `${env.ACM_WEB_BASE_URL.replace(/\/$/, '')}/ai-reports/${realm}/${date}`,
          },
        ],
      });
    }
    elements.push({
      tag: 'note',
      elements: [{ tag: 'plain_text', content: `ACM AI 巡检自动生成 · trigger=${input.trigger} · ${date}` }],
    });

    return {
      config: { wide_screen_mode: true },
      header: {
        template: risky ? 'red' : 'green',
        title: { tag: 'plain_text', content: `${realm} 每日巡检报告（${date}）` },
      },
      elements,
    };
  }

  async sendDailyReportCard(input: DailyReportCardInput): Promise<boolean> {
    return this.sendCard(this.buildDailyReportCard(input));
  }

  private field(title: string, content: string): FeishuCard {
    return { is_short: true, text: { tag: 'lark_md', content: `**${title}**\n${content}` } };
  }
}

export const feishuNotifyService = new FeishuNotifyService();
