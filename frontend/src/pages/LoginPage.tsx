import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { LoginForm } from '@/features/auth/components/LoginForm';
import { useFeishuLogin } from '@/features/auth/hooks/useFeishuLogin';
import { LogoIcon } from '@/shared/components/ui/LogoIcon';
import { SHORT_VERSION } from '@/shared/config/version';

export default function LoginPage() {
  const { phase, checkStatus } = useFeishuLogin();

  // 工作台打开时探测免登配置：enabled 则自动拉起 JSSDK 授权，失败回落密码登录
  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="flex h-9 w-9 items-center justify-center">
              <LogoIcon className="h-9 w-9" />
            </div>
            <h1 className="text-2xl font-bold text-primary">守望者要塞</h1>
            <span className="text-xs text-muted-foreground">{SHORT_VERSION}</span>
          </div>
          <p className="text-sm text-muted-foreground">GM 指挥与运维中枢</p>
        </div>

        {phase === 'password' ? (
          <LoginForm />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">{phase === 'checking' ? '正在检查登录方式…' : '正在通过飞书登录…'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
