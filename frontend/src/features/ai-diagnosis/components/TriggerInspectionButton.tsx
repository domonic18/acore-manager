import { useState } from 'react';
import { toast } from '@/shared/utils/toast.util';
import { usePermission } from '@/shared/hooks/usePermission';
import { useTriggerInspection } from '../hooks/useAiDiagnosis';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';

// 立即巡检（gmlevel≥3）三重防呆：二次确认弹窗 → 触发成功后 2 分钟冷却禁用 →
// 后端 Redis 锁（429）兜底。SCF 异步受理，报告 1-2 分钟后才可见，连点只会浪费模型用量。
const COOLDOWN_MS = 120_000;

export function TriggerInspectionButton({ realm, date }: { realm?: string; date?: string }) {
  const { hasGmLevel } = usePermission();
  const trigger = useTriggerInspection();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  if (!hasGmLevel(3)) return null;

  const handleTrigger = () => {
    trigger.mutate(
      { realm, date },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          setCooldown(true);
          setTimeout(() => setCooldown(false), COOLDOWN_MS);
          toast.success('巡检已触发，约 1-2 分钟后刷新查看');
        },
        onError: (err: Error) => toast.error(err.message || '触发失败'),
      },
    );
  };

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        disabled={trigger.isPending || cooldown}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        {trigger.isPending ? '触发中...' : cooldown ? '巡检进行中...' : '立即巡检'}
      </button>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="确认立即巡检"
        tone="primary"
        confirmText="确认触发"
        pending={trigger.isPending}
        onConfirm={handleTrigger}
      >
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            目标：<span className="font-medium text-foreground">{realm ?? '默认 realm'} / {date ?? '今日'}</span>
          </p>
          <p>巡检经云端异步执行，约 1-2 分钟生成报告；同一目标进行中时重复触发会被拒绝，请勿连点。</p>
        </div>
      </ConfirmDialog>
    </>
  );
}
