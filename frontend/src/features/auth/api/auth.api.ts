import { buildUrl } from '@/shared/api/client';

// 密码二次确认（高危操作发送前校验）
export const authApi = {
  // 故意绕过 apiClient：密码错误返回 401 属业务语义，
  // 走 apiClient 会误清会话并触发 /login 重载
  verifyPassword: async (password: string): Promise<{ valid: boolean }> => {
    const token = localStorage.getItem('acm_token');
    const res = await fetch(buildUrl('/api/auth/verify-password'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ password }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        res.status === 429
          ? '尝试次数过多，请稍后再试'
          : body?.error || '密码校验失败';
      throw new Error(message);
    }
    return body?.data ?? { valid: false };
  },
};
