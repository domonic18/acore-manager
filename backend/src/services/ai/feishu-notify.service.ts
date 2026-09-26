import { createHmac } from 'crypto';
import { env } from '@/config/env';
import { readRuntimeValues, SYSTEM_CONFIG_KEYS } from '@/config/system-config.reader';
import { logger } from '@/middleware/request-logger';
import type { InspectionReportJson } from '@/agent/tools/report-tools';
import type { InspectionInput } from './inspection.service';

// 飞书群机器人 webhook 通知，AI 域告警统一出口（Token 预算超限 / 巡检失败 / 日志断传等）。
// webhook 地址 / 加签密钥 / Web 基地址优先读系统配置页（acm_system_config），未配置回落环境变量。
// 未配置 webhook 时仅记日志；任何失败都不阻塞业务主链路。
// 机器人安全设置为"签名校验"时需配加签密钥：
// sign = HMAC-SHA256(key = `${timestamp}\n${secret}`, message = '') → base64。

type FeishuCard = Record<string, unknown>;
type FeishuPayload = Record<string, unknown>;

export type DailyReportCardInput = Pick<InspectionInput, 'realm' | 'date' | 'trigger'> &
  Pick<InspectionReportJson, 'healthScore' | 'summary' | 'serverHealth' | 'suspiciousPlayers' | 'recommendations'> & {
    /** 当日日志缺口（manifest 缺失 / 某类日志断传），有缺口时简报明示"结论可能低估" */
    dataGaps?: string[];
    /** 由调用方注入的系统配置 web 基地址；缺省回落 env.ACM_WEB_BASE_URL */
    webBaseUrl?: string;
  };

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;
const SEVERITY_LABEL = { high: '高危', medium: '中危', low: '低危' } as const;
const SEVERITY_COLOR = { high: 'red', medium: 'orange', low: 'grey' } as const;
const ACTION_LABEL = { ban: '封禁', investigate: '人工核查', warning: '提醒' } as const;
const ACTION_ORDER = { ban: 0, investigate: 1, warning: 2 } as const;
const TOP_PLAYERS_IN_CARD = 5;

// 卡片 JSON 2.0 的 markdown 组件：支持标准 Markdown 与 <font color> 着色
const mdEl = (content: string): FeishuCard => ({ tag: 'markdown', content });
const fontColor = (color: string, text: string): string => `<font color='${color}'>${text}</font>`;

class FeishuNotifyService {
  async sendText(text: string): Promise<boolean> {
    return this.post({ msg_type: 'text', content: { text } }, `notify: ${text.slice(0, 120)}`);
  }

  async sendCard(card: FeishuCard): Promise<boolean> {
    return this.post({ msg_type: 'interactive', card }, 'card notify');
  }

  private async post(payload: FeishuPayload, label: string): Promise<boolean> {
    const cfg = await readRuntimeValues([SYSTEM_CONFIG_KEYS.feishuWebhookUrl, SYSTEM_CONFIG_KEYS.feishuWebhookSecret]);
    const webhookUrl = cfg.get(SYSTEM_CONFIG_KEYS.feishuWebhookUrl) ?? env.FEISHU_WEBHOOK_URL;
    const webhookSecret = cfg.get(SYSTEM_CONFIG_KEYS.feishuWebhookSecret) ?? env.FEISHU_WEBHOOK_SECRET;
    if (!webhookUrl) {
      logger.warn(`[feishu] webhook not configured, skip ${label}`);
      return false;
    }
    if (webhookSecret) {
      const timestamp = Math.floor(Date.now() / 1000);
      const sign = createHmac('sha256', `${timestamp}\n${webhookSecret}`).update('').digest('base64');
      payload.timestamp = timestamp;
      payload.sign = sign;
    }
    try {
      const resp = await fetch(webhookUrl, {
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

  // GM 简报卡片（JSON 2.0，markdown 组件排版 + 颜色高亮）：
  // 研判结论 → 关键指标清单 → 今日重点关注（TOP 玩家）→ 处置建议 → 报告跳转。
  // 头部颜色三档：红=需立即处置（高危玩家或低健康分）、黄=需关注（有可疑/异常/数据缺口）、绿=平稳。
  // 颜色语义：红=高危/封禁/缺失，橙=中危/低分需关注，绿=健康/齐全。
  buildDailyReportCard(input: DailyReportCardInput): FeishuCard {
    const { realm, date, healthScore } = input;
    const players = [...(input.suspiciousPlayers ?? [])].sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        (ACTION_ORDER[a.suggestedAction] ?? 9) - (ACTION_ORDER[b.suggestedAction] ?? 9),
    );
    const high = players.filter((p) => p.severity === 'high').length;
    const medium = players.filter((p) => p.severity === 'medium').length;
    const low = players.length - high - medium;
    const banCount = players.filter((p) => p.suggestedAction === 'ban').length;
    const crashes = input.serverHealth.crashes?.length ?? 0;
    const errors = input.serverHealth.errors?.length ?? 0;
    const authAnomalies = input.serverHealth.authAnomalies?.length ?? 0;
    const dataGaps = input.dataGaps ?? [];

    const template =
      high > 0 || healthScore < 60
        ? 'red'
        : players.length > 0 || crashes + errors + authAnomalies > 0 || dataGaps.length > 0
          ? 'yellow'
          : 'green';
    const verdict =
      high > 0
        ? `发现 ${high} 名高危玩家，建议今日处置`
        : players.length > 0
          ? `发现 ${players.length} 名可疑玩家，建议关注`
          : crashes + errors + authAnomalies > 0
            ? '服务器存在异常记录，未发现作弊风险'
            : '服务器运行平稳，未发现风险';

    const summaryText = (input.summary ?? '').trim();
    const summaryLine = summaryText.length > 200 ? `${summaryText.slice(0, 200)}…` : summaryText;
    const verdictColor = template === 'red' ? 'red' : template === 'yellow' ? 'orange' : 'green';
    const scoreColor = healthScore < 60 ? 'red' : healthScore < 80 ? 'orange' : 'green';

    const metricLines = [
      `- **健康评分**：${fontColor(scoreColor, `**${healthScore} / 100**`)}`,
      `- **风险玩家**：**${players.length} 名**（${high > 0 ? fontColor('red', `高 ${high}`) : `高 ${high}`} · ${
        medium > 0 ? fontColor('orange', `中 ${medium}`) : `中 ${medium}`
      } · 低 ${low}）`,
      `- **建议封禁**：${banCount > 0 ? fontColor('red', `**${banCount} 名**`) : '0 名'}`,
      `- **崩溃 / 错误**：${crashes} / ${errors}`,
      `- **认证异常**：${authAnomalies}`,
      `- **数据完整性**：${dataGaps.length > 0 ? fontColor('red', `缺失：${dataGaps.join('、')}`) : fontColor('green', '四类日志齐全')}`,
    ];

    const elements: FeishuCard[] = [
      mdEl([fontColor(verdictColor, `**总体研判：${verdict}**`), summaryLine].filter(Boolean).join('\n')),
      { tag: 'hr' },
      mdEl(metricLines.join('\n')),
      { tag: 'hr' },
    ];

    // 每名玩家一个结构化块：风险级别 → 建议处置 → 依据 → 误报提醒，按严重度与处置力度排序
    if (players.length === 0) {
      elements.push(mdEl('本日未发现可疑玩家。'));
    } else {
      elements.push(mdEl(`**今日重点关注（TOP ${Math.min(players.length, TOP_PLAYERS_IN_CARD)}）**`));
      const blocks = players.slice(0, TOP_PLAYERS_IN_CARD).map((p) => {
        const fp = p.falsePositiveSignals?.length ?? 0;
        const lines = [
          `${fontColor(SEVERITY_COLOR[p.severity] ?? 'grey', `**【${SEVERITY_LABEL[p.severity] ?? p.severity}】${p.character}**`)} · 建议：**${
            ACTION_LABEL[p.suggestedAction] ?? p.suggestedAction
          }**`,
        ];
        if (p.account) lines.push(`账号：${p.account}`);
        const reason = (p.reasons?.[0] ?? '').slice(0, 100);
        const evidenceCount = p.evidence?.length ?? 0;
        lines.push(`依据：${reason}${evidenceCount > 1 ? `（另有证据 ${evidenceCount - 1} 条）` : ''}`);
        if (fp > 0) lines.push(`注意：误报信号 ${fp} 项，处置前请人工复核`);
        return lines.join('\n');
      });
      elements.push(mdEl(blocks.join('\n\n')));
    }
    if (dataGaps.length > 0) {
      elements.push(mdEl(`**数据不完整**：${fontColor('red', dataGaps.join('、'))}（相关结论可能低估）`));
    }
    if (input.recommendations?.length) {
      elements.push({ tag: 'hr' });
      elements.push(mdEl([`**处置建议**`, ...input.recommendations.slice(0, 3).map((r) => `- ${r.slice(0, 100)}`)].join('\n')));
    }

    // 报告页由 T4.0 提供；配置了基础地址才渲染跳转按钮（2.0 按钮跳转走 behaviours.open_url）
    const webBaseUrl = input.webBaseUrl ?? env.ACM_WEB_BASE_URL;
    if (webBaseUrl) {
      elements.push({
        tag: 'button',
        type: 'primary',
        text: { tag: 'plain_text', content: '查看完整报告' },
        behaviours: { open_url: { default_url: `${webBaseUrl.replace(/\/$/, '')}/ai-reports/${realm}/${date}` } },
      });
    }
    // 2.0 不再支持 note 组件，脚注用灰色 markdown 文字代替
    elements.push(mdEl(fontColor('grey', `ACM AI 巡检自动生成 · trigger=${input.trigger} · ${date}`)));

    return {
      schema: '2.0',
      header: {
        template,
        title: { tag: 'plain_text', content: `${realm} 每日巡检简报（${date}）` },
      },
      body: { elements },
    };
  }

  async sendDailyReportCard(input: DailyReportCardInput): Promise<boolean> {
    const cfg = await readRuntimeValues([SYSTEM_CONFIG_KEYS.acmWebBaseUrl]);
    const webBaseUrl = cfg.get(SYSTEM_CONFIG_KEYS.acmWebBaseUrl);
    return this.sendCard(this.buildDailyReportCard(webBaseUrl ? { ...input, webBaseUrl } : input));
  }
}

export const feishuNotifyService = new FeishuNotifyService();
