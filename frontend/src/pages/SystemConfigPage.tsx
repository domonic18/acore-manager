import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SystemConfigForm } from '@/features/system-config/components/SystemConfigForm';
import { ModelConfigPanel } from '@/features/model-config/components/ModelConfigPanel';

// 设置页（gm3）：系统配置与 AI 模型配置两个配置域合并为 tab；旧 /model-config 路由重定向至此（?tab=model）。

type SettingsTab = 'system' | 'model';

const TABS: ReadonlyArray<{ key: SettingsTab; label: string }> = [
  { key: 'system', label: '系统配置' },
  { key: 'model', label: 'AI 模型配置' },
];

export default function SystemConfigPage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<SettingsTab>(searchParams.get('tab') === 'model' ? 'model' : 'system');

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-2xl font-bold'>设置</h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          系统级配置（gmlevel=3）。改动即时生效，全部写操作记入审计日志。
        </p>
      </div>

      <div className='flex gap-1 border-b border-border'>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'system' && <SystemConfigForm />}
      {tab === 'model' && <ModelConfigPanel />}
    </div>
  );
}
