import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { SYSTEM_CONFIG_KEYS } from '@/config/system-config.reader';
import { auditLogService } from '@/services/audit-log.service';
import { systemConfigService } from '@/services/system-config.service';

// MCP API-KEY 鉴权（对齐 acore-portal 的单 key 模型）：
// 明文只存在于「生成的那一刻」与「管理员主动查看」时，库里密文落盘（is_secret=true）。
// 无过期、无多 key —— 与 portal 一致：外部 agent 长期持有，轮换即全量失效。

export const MCP_API_KEY_PREFIX = 'acm_mcp_';

export interface McpApiKeyView {
  configured: boolean;
  masked: string | null;
  updatedAt: string | null;
}

export interface McpOperator {
  operatorId: number;
  operatorName: string;
}

/** 指纹（sha256 前 8 位）：审计日志里记录 key 变更，不落明文 */
export function apiKeyFingerprint(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex').slice(0, 8);
}

export function generateApiKeyPlain(): string {
  return `${MCP_API_KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
}

export function maskApiKey(plain: string): string {
  if (!plain) return '';
  if (plain.length <= 12) return '*'.repeat(plain.length);
  return `${plain.slice(0, 8)}${'*'.repeat(8)}${plain.slice(-4)}`;
}

/**
 * 定长比较：比 sha256 摘要（长度恒 32），避免 timingSafeEqual 对不等长输入抛错，
 * 同时避免按字节短路带来的时序侧信道。
 */
export function plainEquals(candidate: string, expected: string): boolean {
  if (!candidate || !expected) return false;
  const a = createHash('sha256').update(candidate, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

class McpAuthService {
  /** 掩码视图；未配置时自动生成并落库，保证 MCP 端点始终有一把可用 key */
  async getApiKeyView(): Promise<McpApiKeyView> {
    const plain = await this.readKey();
    if (!plain) return this.provision('mcp-auth');
    const updatedAt = await systemConfigService.getSecretUpdatedAt(SYSTEM_CONFIG_KEYS.mcpApiKey);
    return { configured: true, masked: maskApiKey(plain), updatedAt: updatedAt?.toISOString() ?? null };
  }

  /** 明文取回（审计留痕） */
  async revealApiKey(operator: McpOperator): Promise<string> {
    let plain = await this.readKey();
    if (!plain) {
      await this.provision(operator.operatorName);
      plain = await this.readKey();
    }
    await auditLogService.record({
      operatorId: operator.operatorId,
      operatorName: operator.operatorName,
      operation: 'mcp.token.reveal',
      target: 'mcp_api_key',
      details: `fingerprint=${apiKeyFingerprint(plain ?? '')}`,
    });
    return plain ?? '';
  }

  /** 轮换：旧 key 立即失效，返回新明文 */
  async rotateApiKey(operator: McpOperator): Promise<string> {
    const old = await this.readKey();
    const plain = generateApiKeyPlain();
    await systemConfigService.setSecretValue(SYSTEM_CONFIG_KEYS.mcpApiKey, plain, operator.operatorName);
    await auditLogService.record({
      operatorId: operator.operatorId,
      operatorName: operator.operatorName,
      operation: 'mcp.token.rotate',
      target: 'mcp_api_key',
      details: `old=${old ? apiKeyFingerprint(old) : 'none'} new=${apiKeyFingerprint(plain)}`,
    });
    return plain;
  }

  /** 校验请求携带的 key；未配置 / 不匹配一律 false（不区分原因，避免探测） */
  async verifyApiKey(candidate: string): Promise<boolean> {
    const expected = await this.readKey();
    if (!expected) return false;
    return plainEquals(candidate, expected);
  }

  private async readKey(): Promise<string | null> {
    return systemConfigService.getSecretValue(SYSTEM_CONFIG_KEYS.mcpApiKey);
  }

  private async provision(operatorName: string): Promise<McpApiKeyView> {
    const plain = generateApiKeyPlain();
    await systemConfigService.setSecretValue(SYSTEM_CONFIG_KEYS.mcpApiKey, plain, operatorName);
    return { configured: true, masked: maskApiKey(plain), updatedAt: new Date().toISOString() };
  }
}

export const mcpAuthService = new McpAuthService();
