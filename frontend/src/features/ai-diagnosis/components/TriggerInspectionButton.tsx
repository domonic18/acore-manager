import { toast } from '@/shared/utils/toast.util';
import { usePermission } from '@/shared/hooks/usePermission';
import { useTriggerInspection } from '../hooks/useAiDiagnosis';

// 立即巡检（gmlevel≥3）：复用页面筛选的 realm/date 触发 SCF Job；异步受理即返回，报告 1-2 分钟后生成
export function TriggerInspectionButton({ realm, date }: { realm?: string; date?: string }) {
  const { hasGmLevel } = usePermission();
  const trigger = useTriggerInspection();

  if (!hasGmLevel(3)) return null;

  const handleTrigger = () => {
    trigger.mutate(
      { realm, date },
      {
        onSuccess: () => toast.success('巡检已触发，约 1-2 分钟后刷新查看'),
        onError: (err: Error) => toast.error(err.message || '触发失败'),
      },
    );
  };

  return (
    <button
      onClick={handleTrigger}
      disabled={trigger.isPending}
      className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {trigger.isPending ? '触发中...' : '立即巡检'}
    </button>
  );
}
