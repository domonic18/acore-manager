import { apiClient } from '@/shared/api/client';

// 飞书免登绑定：open_id ↔ AC 账号 1:1 映射（gmlevel≥3 管理，绑定即授予登录身份）
export interface FeishuBinding {
  id: number;
  feishuOpenId: string;
  feishuUnionId: string;
  feishuName: string;
  acUsername: string;
  createdBy: string;
  createdAt: string;
}

export interface CreateFeishuBindingInput {
  feishuOpenId: string;
  feishuUnionId?: string;
  feishuName?: string;
  acUsername: string;
}

export const feishuBindingApi = {
  list: () => apiClient.get<FeishuBinding[]>('/api/feishu-bindings'),
  create: (input: CreateFeishuBindingInput) => apiClient.post<FeishuBinding>('/api/feishu-bindings', input),
  remove: (id: number) => apiClient.del<{ success: boolean }>(`/api/feishu-bindings/${id}`),
};
