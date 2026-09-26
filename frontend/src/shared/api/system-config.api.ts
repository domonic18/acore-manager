import { apiClient } from '@/shared/api/client';

// 系统配置只读视图（GET /api/system-config）：ai-diagnosis 等多 feature 消费默认 realm，
// 按 shared ≥2 feature 规则上提；写接口（update/soapTest）留在 features/system-config
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

export const systemConfigReadApi = {
  get: () => apiClient.get<SystemConfig>('/api/system-config'),
};
