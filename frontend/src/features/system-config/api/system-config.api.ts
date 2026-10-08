import { apiClient } from '@/shared/api/client';
import { SystemConfig } from '@/shared/api/system-config.api';

// 空串/null 语义：清除该项并回落环境变量（soap.password 例外，留空 = 不修改）
// SystemConfig 只读视图与 GET 已上提 shared/api（多 feature 消费），此处保留写路径

export interface SystemConfigPayload {
  defaultRealm?: string;
  soap?: {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
  };
  feishu?: {
    webhookUrl?: string | null;
    webhookSecret?: string | null;
    webBaseUrl?: string | null;
  };
  ai?: {
    dailyTokenBudget?: number | null;
    agentCacheSize?: number | null;
    toolCallBudget?: number | null;
    toolTimeoutMs?: number | null;
  };
  login?: {
    bruteForceEnabled?: string | null;
    maxAttempts?: number | null;
    lockoutMinutes?: number | null;
    captchaEnabled?: string | null;
    captchaTtlSeconds?: number | null;
  };
  inspection?: {
    /** 逗号/换行分隔 IPv4；空串/null = 清除白名单 */
    trustedIps?: string | null;
    /** 逗号/换行分隔 zone id（非负整数）；空串/null = 清除追加排除集 */
    carryExcludedZones?: string | null;
  };
}

export interface SoapTestResult {
  ok: boolean;
  latencyMs: number;
  error: string | null;
}

export const systemConfigApi = {
  update: (payload: SystemConfigPayload) => apiClient.put<SystemConfig>('/api/system-config', payload),
  soapTest: () => apiClient.post<SoapTestResult>('/api/system-config/soap-test'),
};
