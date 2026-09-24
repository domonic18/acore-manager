import { useEffect, useState } from 'react';
import { Dialog } from '@/shared/components/Dialog';
import { toast } from '@/shared/utils/toast.util';
import { aiDiagnosisApi } from '../api/ai-diagnosis.api';
import { useViolationTypes } from '../hooks/useAiDiagnosis';

// 标记误报弹窗（T4.3，arch 4.6 豁免白名单）：单/多目标提交 (guid, type, mapId?, reason)。
// 多目标 Promise.allSettled 部分失败仅提示，不中断其余目标。

export interface MarkFalsePositiveTarget {
  guid: number;
  name: string;
}

interface MarkFalsePositiveDialogProps {
  targets: MarkFalsePositiveTarget[];
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function MarkFalsePositiveDialog({ targets, open, onClose, onDone }: MarkFalsePositiveDialogProps) {
  const { data: violationTypes } = useViolationTypes();
  const [violationType, setViolationType] = useState('');
  const [mapId, setMapId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setViolationType('');
      setMapId('');
      setReason('');
    }
  }, [open]);

  const reasonTrimmed = reason.trim();
  const canSubmit = violationType !== '' && reasonTrimmed.length >= 2 && reasonTrimmed.length <= 500 && !submitting && targets.length > 0;
  const title = targets.length === 1 ? `标记误报：${targets[0].name}` : `批量标记误报（${targets.length} 个角色）`;

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) return;
    const map = mapId.trim() === '' ? null : Number(mapId);
    setSubmitting(true);
    try {
      const results = await Promise.allSettled(
        targets.map((t) => aiDiagnosisApi.createExemption({ characterGuid: t.guid, violationType, mapId: map, reason: reasonTrimmed })),
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = targets.length - ok;
      if (fail === 0) {
        toast.success(targets.length > 1 ? `已为 ${ok} 个角色标记误报` : '已标记误报');
      } else if (ok === 0) {
        const msg = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
        toast.error(msg ? (msg.reason as Error)?.message || '标记失败' : '标记失败');
      } else {
        toast.error(`部分成功：成功 ${ok} / 失败 ${fail}`);
      }
      onDone();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
            取消
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? '提交中...' : '提交'}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">违规类型</label>
          <select
            value={violationType}
            onChange={(e) => setViolationType(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">请选择类型</option>
            {(violationTypes ?? []).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">地图 ID（可选，留空表示不限地图）</label>
          <input
            value={mapId}
            onChange={(e) => setMapId(e.target.value)}
            inputMode="numeric"
            placeholder="如 0"
            className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">误报理由（2-500 字，必填）</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="说明误报依据，如：十字军光环 + 骑乘加速合法"
            className="w-full resize-none rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
    </Dialog>
  );
}
