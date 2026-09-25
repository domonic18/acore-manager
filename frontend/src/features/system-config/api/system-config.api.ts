import { apiClient } from '@/shared/api/client';

// 空串/null 语义：清除该项并回落环境变量（soap.password 例外，留空 = 不修改）

export interface SystemConfig {
  defaultRealm: string;
  soap: {
    host: string;
    port: number;
    username: string;
    passwordMasked: string | null;
    source: 'db' | 'env';
  };
  feishu: {
    webhookUrl: string;
    webhookSecretMasked: string | null;
    webBaseUrl: string;
  };
  ai: {
    dailyTokenBudget: number;
    agentCacheSize: number;
    toolCallBudget: number;
    toolTimeoutMs: number;
  };
  login: {
    bruteForceEnabled: boolean;
    maxAttempts: number;
    lockoutMinutes: number;
    captchaEnabled: boolean;
    captchaTtlSeconds: number;
  };
  updatedAt: string | null;
}

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
}

export interface SoapTestResult {
  ok: boolean;
  latencyMs: number;
  error: string | null;
}

export const systemConfigApi = {
  get: () => apiClient.get<SystemConfig>('/api/system-config'),
  update: (payload: SystemConfigPayload) => apiClient.put<SystemConfig>('/api/system-config', payload),
  soapTest: () => apiClient.post<SoapTestResult>('/api/system-config/soap-test'),
};
