import { useState } from 'react';
import { Dialog } from '@/shared/components/Dialog';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { BanReasonFields } from '@/shared/components/BanFlowDialogs';
import { durationLabels } from '@/shared/constants/game.constants';
import { useBanFlow } from '@/shared/hooks/useBanFlow';

// IP 封禁流程状态机复用 useBanFlow（时长/原因），额外持有 IP 输入
export function useIpBanFlow() {
  const banFlow = useBanFlow();
  const [ip, setIp] = useState('');

  const openForm = () => {
    setIp('');
    banFlow.openForm();
  };

  return { ...banFlow, ip, setIp, openForm };
}

const FIELD_CLASS =
  'w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring';

interface IpBanFormDialogProps {
  flow: ReturnType<typeof useIpBanFlow>;
  canProceed: boolean;
  onProceed: () => void;
}

export function IpBanFormDialog({ flow, canProceed, onProceed }: IpBanFormDialogProps) {
  return (
    <Dialog
      open={flow.stage === 'form'}
      onClose={flow.closeAll}
      title="封禁 IP"
      footer={
        <>
          <button
            onClick={flow.closeAll}
            className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
          >
            取消
          </button>
          <button
            onClick={onProceed}
            disabled={!canProceed}
            className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            下一步
          </button>
        </>
      }
    >
      <div>
        <label className="block text-sm font-medium mb-1.5">IP 地址</label>
        <input
          type="text"
          value={flow.ip}
          onChange={(e) => flow.setIp(e.target.value)}
          placeholder="请输入 IP 地址"
          className={FIELD_CLASS}
        />
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
  );
}

interface IpBanConfirmDialogProps {
  flow: ReturnType<typeof useIpBanFlow>;
  banPending: boolean;
  onConfirm: () => void;
  onBack: () => void;
}

export function IpBanConfirmDialog({ flow, banPending, onConfirm, onBack }: IpBanConfirmDialogProps) {
  return (
    <Dialog
      open={flow.stage === 'confirm'}
      onClose={flow.closeAll}
      title="确认封禁"
      footer={
        <>
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
          >
            返回修改
          </button>
          <button
            onClick={onConfirm}
            disabled={banPending}
            className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {banPending ? '处理中...' : '确认封禁'}
          </button>
        </>
      }
    >
      <div className="text-sm text-muted-foreground mb-4">
        请再次确认以下封禁信息，操作后将立即生效：
      </div>

      <div className="space-y-3 bg-muted/50 rounded-md p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">目标 IP</span>
          <span className="font-mono font-medium">{flow.ip}</span>
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
  );
}

interface IpBanUnbanDialogProps {
  targetIp: string;
  unbanPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function IpBanUnbanDialog({ targetIp, unbanPending, onClose, onConfirm }: IpBanUnbanDialogProps) {
  return (
    <ConfirmDialog
      open={targetIp !== ''}
      onClose={onClose}
      title="确认解封"
      tone="success"
      confirmText="确认解封"
      pending={unbanPending}
      onConfirm={onConfirm}
    >
      <div className="text-sm text-muted-foreground mb-4">请确认要解封以下 IP 地址：</div>
      <div className="bg-muted/50 rounded-md p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">目标 IP</span>
          <span className="font-mono font-medium">{targetIp}</span>
        </div>
      </div>
    </ConfirmDialog>
  );
}
