import { useSearchParams } from 'react-router-dom';
import { Mail, Radio } from 'lucide-react';
import { BroadcastPanel } from '@/features/gm-tool/components/BroadcastPanel';
import { GmMailPanel } from '@/features/gm-tool/components/GmMailPanel';

// GM 工具页：Tab 导航切换工具面板，?tab= 深链可直达；新增工具在 TABS 注册即可。

const TABS = [
  { key: 'broadcast', label: '广播消息', icon: Radio },
  { key: 'mail', label: '邮件', icon: Mail },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function GmToolPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab');
  const active: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : 'broadcast';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">GM 工具</h1>

      <div className="flex gap-1 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSearchParams(key === 'broadcast' ? {} : { tab: key }, { replace: true })}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              active === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {active === 'broadcast' && <BroadcastPanel />}
      {active === 'mail' && <GmMailPanel />}
    </div>
  );
}
