import { Dialog } from './Dialog';
import { banReasonOptions, durationLabels } from '@/shared/constants/game.constants';
import type { BanFlowController } from '@/shared/hooks/useBanFlow';

const FIELD_CLASS =
  'w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring';

// 原因下拉 + 自定义原因输入（封禁/禁言对话框共用；文案可定制以适配禁言场景）
export function BanReasonFields({
  reasonType,
  onReasonTypeChange,
  customReason,
  onCustomReasonChange,
  reasonLabel = '封禁原因',
  customPlaceholder = '请输入封禁原因',
}: {
  reasonType: string;
  onReasonTypeChange: (v: string) => void;
  customReason: string;
  onCustomReasonChange: (v: string) => void;
  reasonLabel?: string;
  customPlaceholder?: string;
}) {
  const isCustomReason = reasonType === '__custom__';
  return (
    <>
      <div>
        <label className="block text-sm font-medium mb-1.5">{reasonLabel}</label>
        <select
          value={reasonType}
          onChange={(e) => onReasonTypeChange(e.target.value)}
          className={FIELD_CLASS}
        >
          {banReasonOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      {isCustomReason && (
        <div>
          <label className="block text-sm font-medium mb-1.5">自定义原因</label>
          <input
            type="text"
            value={customReason}
            onChange={(e) => onCustomReasonChange(e.target.value)}
            placeholder={customPlaceholder}
            className={FIELD_CLASS}
          />
        </div>
      )}
    </>
  );
}

export interface BanFlowTargetInfo {
  label: string;
  name: string;
  metaLabel: string;
  metaValue: string | number;
}

interface BanFlowDialogsProps {
  flow: BanFlowController;
  title: string;
  target: BanFlowTargetInfo;
  onConfirm: () => void;
  pending: boolean;
}

// 封禁表单 → 二次确认双 Dialog（AccountDetailPage / CharacterDetailPage 的逐字重复收拢）
export function BanFlowDialogs({ flow, title, target, onConfirm, pending }: BanFlowDialogsProps) {
  return (
    <>
      <Dialog
        open={flow.stage === 'form'}
        onClose={flow.closeAll}
        title={title}
        footer={
          <>
            <button
              onClick={flow.closeAll}
              className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
            >
              取消
            </button>
            <button
              onClick={flow.proceedToConfirm}
              disabled={!flow.canProceed}
              className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              下一步
            </button>
          </>
        }
      >
        <div className="bg-muted/50 rounded-md p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{target.label}</span>
            <span className="font-medium">{target.name}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-muted-foreground">{target.metaLabel}</span>
            <span>{target.metaValue}</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">封禁时长</label>
          <select
            value={flow.duration}
            onChange={(e) => flow.setDuration(e.target.value)}
            className={FIELD_CLASS}
          >
            <option value="1h">1小时</option>
            <option value="1d">1天</option>
            <option value="3d">3天</option>
            <option value="7d">7天</option>
            <option value="30d">30天</option>
            <option value="-1">永久</option>
          </select>
        </div>

        <BanReasonFields
          reasonType={flow.reasonType}
          onReasonTypeChange={flow.setReasonType}
          customReason={flow.customReason}
          onCustomReasonChange={flow.setCustomReason}
        />
      </Dialog>

      <Dialog
        open={flow.stage === 'confirm'}
        onClose={flow.closeAll}
        title="确认封禁"
        footer={
          <>
            <button
              onClick={flow.backToForm}
              className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
            >
              返回修改
            </button>
            <button
              onClick={onConfirm}
              disabled={pending}
              className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? '处理中...' : '确认封禁'}
            </button>
          </>
        }
      >
        <div className="text-sm text-muted-foreground mb-4">
          请再次确认以下封禁信息，操作后将立即生效：
        </div>

        <div className="space-y-3 bg-muted/50 rounded-md p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{target.label}</span>
            <span className="font-medium">{target.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">封禁时长</span>
            <span className="font-medium text-red-400">{durationLabels[flow.duration]}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">封禁原因</span>
            <span className="font-medium">{flow.finalReason}</span>
          </div>
        </div>
      </Dialog>
    </>
  );
}
