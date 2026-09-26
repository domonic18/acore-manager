import { useEffect, useState } from 'react';
import { Dialog } from '@/shared/components/Dialog';
import { BanReasonFields } from '@/shared/components/BanFlowDialogs';

interface MuteDialogProps {
  open: boolean;
  onClose: () => void;
  characterName: string;
  characterGuid: number;
  pending: boolean;
  onSubmit: (data: { duration: string; reason: string }) => void;
}

const MUTE_DURATION_OPTIONS = [
  { value: '10m', label: '10分钟' },
  { value: '1h', label: '1小时' },
  { value: '1d', label: '1天' },
  { value: '3d', label: '3天' },
  { value: '7d', label: '7天' },
  { value: '30d', label: '30天' },
];

export function MuteDialog({ open, onClose, characterName, characterGuid, pending, onSubmit }: MuteDialogProps) {
  const [duration, setDuration] = useState('1h');
  const [reasonType, setReasonType] = useState('恶意刷屏');
  const [customReason, setCustomReason] = useState('');

  const isCustomReason = reasonType === '__custom__';
  const finalReason = isCustomReason ? customReason.trim() : reasonType;
  const canProceed = !isCustomReason || customReason.trim().length > 0;

  useEffect(() => {
    if (open) {
      setDuration('1h');
      setReasonType('恶意刷屏');
      setCustomReason('');
    }
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="禁言角色"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
          >
            取消
          </button>
          <button
            onClick={() => canProceed && onSubmit({ duration, reason: finalReason })}
            disabled={!canProceed || pending}
            className="px-4 py-2 rounded-md bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            {pending ? '处理中...' : '确认禁言'}
          </button>
        </>
      }
    >
      <div className="bg-muted/50 rounded-md p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">目标角色</span>
          <span className="font-medium">{characterName}</span>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-muted-foreground">角色GUID</span>
          <span>{characterGuid}</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5">禁言时长</label>
        <select
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {MUTE_DURATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <BanReasonFields
        reasonType={reasonType}
        onReasonTypeChange={setReasonType}
        customReason={customReason}
        onCustomReasonChange={setCustomReason}
        reasonLabel="禁言原因"
        customPlaceholder="请输入禁言原因"
      />
    </Dialog>
  );
}
