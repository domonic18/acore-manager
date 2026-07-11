import { apiClient } from '@/shared/api/client';

export interface LoginConfig {
  captchaEnabled: boolean;
}

export interface CaptchaData {
  sessionId: string;
  svg: string;
}

export const captchaApi = {
  getLoginConfig: () => apiClient.get<LoginConfig>('/api/auth/login-config'),
  getCaptcha: () => apiClient.get<CaptchaData>('/api/auth/captcha'),
};
