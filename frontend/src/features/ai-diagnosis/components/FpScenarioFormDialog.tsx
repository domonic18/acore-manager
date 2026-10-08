import { useEffect, useState } from 'react';
import { Dialog } from '@/shared/components/Dialog';
import { toast } from '@/shared/utils/toast.util';
import type { FpScenarioInput, FpScenarioItem, ScenarioSpot } from '../api/ai-diagnosis.api';
import { useCreateFpScenario, useUpdateFpScenario, useViolationTypes } from '../hooks/useAiDiagnosis';

// 误报场景库表单弹窗：任务传送点/已知几何误报场景。spots 为可选坐标点数组（JSON），
// 留空则按 地图×类型 无差别命中（如影牙 zaxis），填写后须坐标落入半径内才触发 quest 强信号。

interface FpScenarioFormDialogProps {
  editing: FpScenarioItem | null;
  open: boolean;
  onClose: () => void;
}

function parseSpots(text: string): ScenarioSpot[] | null {
  if (text.trim() === '') return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 20) return null;
    return parsed.map((s) => {
      const o = s as Record<string, unknown>;
      return { x: Number(o.x), y: Number(o.y), z: Number(o.z), radiusYards: Number(o.radiusYards) };
    });
  } catch {
    return null;
  }
}

function spotsValid(spots: ScenarioSpot[] | null): boolean {
  return (
    spots !== null && spots.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z) && s.radiusYards > 0)
  );
}

export function FpScenarioFormDialog({ editing, open, onClose }: FpScenarioFormDialogProps) {
  const { data: violationTypes } = useViolationTypes();
  const create = useCreateFpScenario();
  const update = useUpdateFpScenario();
  const [mapId, setMapId] = useState('');
  const [violationType, setViolationType] = useState('');
  const [questId, setQuestId] = useState('');
  const [spotsText, setSpotsText] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setMapId(editing.mapId?.toString() ?? '');
      setViolationType(editing.violationType);
      setQuestId(editing.questId?.toString() ?? '');
      setSpotsText(editing.spots ? JSON.stringify(editing.spots, null, 2) : '');
      setReason(editing.reason);
    } else {
      setMapId('');
      setViolationType('');
      setQuestId('');
      setSpotsText('');
      setReason('');
    }
  }, [open, editing]);

  const spots = parseSpots(spotsText);
  const spotsOk = spots !== null && spotsValid(spots);
  const submitting = create.isPending || update.isPending;
  const canSubmit = violationType !== '' && reason.trim().length >= 2 && spotsOk && !submitting;

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit || spots === null) return;
    const input: FpScenarioInput = {
      mapId: mapId.trim() === '' ? null : Number(mapId),
      violationType,
      questId: questId.trim() === '' ? null : Number(questId),
      spots: spots.length === 0 ? null : spots,
      reason: reason.trim(),
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, patch: input });
        toast.success('场景已更新');
      } else {
        await create.mutateAsync(input);
        toast.success('场景已录入');
      }
      onClose();
    } catch (err) {
      toast.error((err as Error).message || '提交失败');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `编辑误报场景 #${editing.id}` : '录入误报场景'}
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
      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
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
          <label className="mb-1 block text-xs text-muted-foreground">地图 ID（留空=不限地图）</label>
          <input
            value={mapId}
            onChange={(e) => setMapId(e.target.value)}
            inputMode="numeric"
            placeholder="如 609（黑锋要塞）"
            className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">关联任务 ID（可选，仅展示用）</label>
          <input
            value={questId}
            onChange={(e) => setQuestId(e.target.value)}
            inputMode="numeric"
            placeholder="如 12757"
            className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-muted-foreground">
            传送坐标点（可选 JSON 数组 [{`{x,y,z,radiusYards}`}...]；留空=不限坐标）
          </label>
          <textarea
            value={spotsText}
            onChange={(e) => setSpotsText(e.target.value)}
            rows={4}
            placeholder={'[{"x":2117,"y":-5890,"z":105,"radiusYards":200}]'}
            className={`w-full resize-y rounded-md border bg-card px-3 py-2 font-mono text-xs outline-none focus:ring-1 focus:ring-primary ${
              spotsOk ? 'border-border' : 'border-destructive'
            }`}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-muted-foreground">误报说明（2-500 字，写入巡检信号详情）</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="如：任务 12757 经天灾传送门传回悬空的 Acherus，落地触发 TeleportPlane（模块无服务端传送豁免）"
            className="w-full resize-y rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
    </Dialog>
  );
}
