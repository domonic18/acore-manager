import { SystemConfigForm } from '@/features/system-config/components/SystemConfigForm';

export default function SystemConfigPage() {
  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-2xl font-bold'>系统配置</h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          系统级运行参数（gmlevel=3）。改动即时生效，全部写操作记入审计日志。
        </p>
      </div>
      <SystemConfigForm />
    </div>
  );
}
