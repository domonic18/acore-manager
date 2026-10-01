import { LoginForm } from '@/features/auth/components/LoginForm';
import { LogoIcon } from '@/shared/components/ui/LogoIcon';
import { SHORT_VERSION } from '@/shared/config/version';

export default function LoginPage() {
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

        <LoginForm />
      </div>
    </div>
  );
}
