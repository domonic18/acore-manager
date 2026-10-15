import { apiClient } from '@/shared/api/client';

export interface FeishuStatus {
  enabled: boolean;
  appId: string;
}

export interface FeishuLoginResult {
  token: string;
  user: {
    id: number;
    username: string;
    gmlevel: number;
  };
}

export const feishuAuthApi = {
  getStatus: () => apiClient.get<FeishuStatus>('/api/auth/feishu/status'),

  // 与密码登录同策略：登录端点绕过 apiClient（未登录态的 401 是业务错误而非会话过期，
  // 走 apiClient 会误清会话并触发 /login 重载循环），503 就绪门禁按 Retry-After 有限重试
  login: async (code: string): Promise<FeishuLoginResult> => {
    const postLogin = () =>
      fetch('/api/auth/feishu/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

    const parseGate = async (res: Response) => {
      if (res.status !== 503) return null;
      try {
        const body = await res.json();
        return body && typeof body === 'object' ? (body as { code?: string; error?: string }) : null;
      } catch {
        return null;
      }
    };

    let response = await postLogin();
    let gate = await parseGate(response);
    for (let retried = 0; gate?.code === 'DB_INITIALIZING' && retried < 2; retried++) {
      await new Promise((r) => setTimeout(r, (Number(response.headers.get('Retry-After')) || 2) * 1000));
      response = await postLogin();
      gate = await parseGate(response);
    }

    if (response.status === 503) {
      throw new Error(
        gate?.code === 'DB_DEGRADED' ? '数据库暂不可用，请稍后重试' : gate?.error || '服务启动中，请稍后重试',
      );
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || '飞书登录失败 / feishu login failed');
    }
    return result.data as FeishuLoginResult;
  },
};
