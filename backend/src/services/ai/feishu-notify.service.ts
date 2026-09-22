import { env } from '@/config/env';
import { logger } from '@/middleware/request-logger';

// 飞书群机器人 webhook 通知，AI 域告警统一出口（Token 预算超限 / 巡检失败 / 日志断传等）。
// 未配置 FEISHU_WEBHOOK_URL 时仅记日志；任何失败都不阻塞业务主链路。
class FeishuNotifyService {
  async sendText(text: string): Promise<boolean> {
    if (!env.FEISHU_WEBHOOK_URL) {
      logger.warn(`[feishu] webhook not configured, skip notify: ${text.slice(0, 120)}`);
      return false;
    }
    try {
      const resp = await fetch(env.FEISHU_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ msg_type: 'text', content: { text } }),
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) {
        logger.error(`[feishu] notify failed: HTTP ${resp.status}`);
        return false;
      }
      return true;
    } catch (err) {
      logger.error(`[feishu] notify error: ${(err as Error).message}`);
      return false;
    }
  }
}

export const feishuNotifyService = new FeishuNotifyService();
