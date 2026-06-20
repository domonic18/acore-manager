import { useState } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { captchaApi } from '@/features/auth/api/captcha.api';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captchaCode, setCaptchaCode] = useState('');
  const [captchaSessionId, setCaptchaSessionId] = useState('');
  const [captchaSvg, setCaptchaSvg] = useState('');
  const [requireCaptcha, setRequireCaptcha] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadCaptcha = async () => {
    try {
      const data = await captchaApi.getCaptcha();
      setCaptchaSessionId(data.sessionId);
      setCaptchaSvg(data.svg);
    } catch {
      setError('验证码加载失败 / Failed to load captcha');
    }
  };

  const performLogin = async (user: string, pass: string, sessionId?: string, code?: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: user,
        password: pass,
        ...(sessionId && code ? { captchaSessionId: sessionId, captchaCode: code } : {}),
      }),
    });

    const result = await response.json();

    if (!result.success) {
      if (result.data?.requireCaptcha) {
        setRequireCaptcha(true);
        await loadCaptcha();
        setCaptchaCode('');
        return;
      }

      throw new Error(result.error || '登录失败');
    }

    login(result.data.token, result.data.user);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await performLogin(
        username,
        password,
        requireCaptcha ? captchaSessionId : undefined,
        requireCaptcha ? captchaCode : undefined,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
      if (requireCaptcha) {
        await loadCaptcha();
        setCaptchaCode('');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-primary">ACM</h1>
          <p className="text-sm text-muted-foreground">AzerothCore Manager</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">账号</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="用户名"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="密码"
              required
            />
          </div>

          {requireCaptcha && (
            <div className="space-y-2">
              <label className="block text-sm font-medium">验证码</label>
              <div className="flex items-center gap-3">
                <div
                  className="rounded-md border border-border bg-card overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: captchaSvg }}
                />
                <button
                  type="button"
                  onClick={loadCaptcha}
                  className="text-sm text-primary hover:underline"
                >
                  刷新
                </button>
              </div>
              <input
                type="text"
                value={captchaCode}
                onChange={(e) => setCaptchaCode(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="请输入验证码"
                required
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
