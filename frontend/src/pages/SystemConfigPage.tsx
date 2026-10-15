import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SystemConfigForm } from '@/features/system-config/components/SystemConfigForm';
import { ModelConfigPanel } from '@/features/model-config/components/ModelConfigPanel';
import { FeishuBindingManager } from '@/features/feishu-binding/components/FeishuBindingManager';

// 设置页（gm3）：系统配置 / AI 模型配置 / 飞书免登绑定 三个配置域合并为 tab；
// 旧 /model-config、/feishu-bindings 路由重定向至此（?tab=model / ?tab=bindings）。

type SettingsTab = 'system' | 'model' | 'bindings';

const TABS: ReadonlyArray<{ key: SettingsTab; label: string }> = [
  { key: 'system', label: '系统配置' },
  { key: 'model', label: 'AI 模型配置' },
  { key: 'bindings', label: '飞书免登绑定' },
];

function tabFromParam(value: string | null): SettingsTab {
  return value === 'model' || value === 'bindings' ? value : 'system';
}

export default function SystemConfigPage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<SettingsTab>(tabFromParam(searchParams.get('tab')));

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
      {tab === 'bindings' && (
        <div className='space-y-3'>
          <p className='text-sm text-muted-foreground'>
            维护飞书用户与后台 AC 账号的 1:1 映射；凭证在「系统配置」的飞书段设置，未配置时免登整体关闭。
          </p>
          <FeishuBindingManager />
        </div>
      )}
    </div>
  );
}
