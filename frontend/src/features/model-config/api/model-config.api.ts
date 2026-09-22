import { apiClient } from '@/shared/api/client';

export interface ModelConfig {
  id: number;
  name: string;
  provider: string;
  protocol: string;
  baseUrl: string;
  modelName: string;
  apiKeyMasked: string;
  temperature: number | null;
  maxTokens: number | null;
  isDefault: boolean;
  isActive: boolean;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModelConfigPayload {
  name: string;
  provider: string;
  protocol: string;
  baseUrl: string;
  modelName: string;
  apiKey?: string;
  temperature?: number | null;
  maxTokens?: number | null;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface TestConnectionResult {
  ok: boolean;
  latencyMs: number;
  error: string | null;
}

export interface ProviderPreset {
  value: string;
  label: string;
  baseUrl: string;
  protocol: string;
}

// provider 预设自动填充 baseUrl + protocol（编辑时可改）
export const PROVIDER_PRESETS: ProviderPreset[] = [
  { value: 'zhipu', label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', protocol: 'openai' },
  { value: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', protocol: 'openai' },
  { value: 'kimi', label: 'Kimi (Moonshot)', baseUrl: 'https://api.moonshot.cn/v1', protocol: 'openai' },
  { value: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', protocol: 'openai' },
  { value: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com', protocol: 'anthropic' },
  { value: 'custom', label: '自定义', baseUrl: '', protocol: 'openai' },
];

export const modelConfigApi = {
  list: () => apiClient.get<ModelConfig[]>('/api/ai/model-configs'),
  create: (payload: ModelConfigPayload) => apiClient.post<ModelConfig>('/api/ai/model-configs', payload),
  update: (id: number, payload: Partial<ModelConfigPayload>) =>
    apiClient.put<ModelConfig>(`/api/ai/model-configs/${id}`, payload),
  remove: (id: number) => apiClient.del<{ success: boolean }>(`/api/ai/model-configs/${id}`),
  setDefault: (id: number) => apiClient.post<ModelConfig>(`/api/ai/model-configs/${id}/default`),
  test: (id: number) => apiClient.post<TestConnectionResult>(`/api/ai/model-configs/${id}/test`),
};
