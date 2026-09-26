import { useCallback, useState } from 'react';

// 封禁流程状态机：idle → form（填写时长/原因）→ confirm（二次确认）→ idle。
// executeBan 由调用方注入（账号 mutate {id,data} / 角色 mutate {guid,data}），本 hook 只管表单状态。
export type BanFlowStage = 'idle' | 'form' | 'confirm';

export interface BanFlowController {
  stage: BanFlowStage;
  isOpen: boolean;
  isConfirming: boolean;
  duration: string;
  reasonType: string;
  customReason: string;
  isCustomReason: boolean;
  finalReason: string;
  canProceed: boolean;
  setDuration: (v: string) => void;
  setReasonType: (v: string) => void;
  setCustomReason: (v: string) => void;
  openForm: () => void;
  proceedToConfirm: () => void;
  backToForm: () => void;
  closeAll: () => void;
}

const CUSTOM_REASON = '__custom__';
const DEFAULT_DURATION = '1d';
const DEFAULT_REASON = '违规';

export function useBanFlow(): BanFlowController {
  const [stage, setStage] = useState<BanFlowStage>('idle');
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [reasonType, setReasonType] = useState(DEFAULT_REASON);
  const [customReason, setCustomReason] = useState('');

  const isCustomReason = reasonType === CUSTOM_REASON;
  const finalReason = isCustomReason ? customReason.trim() : reasonType;
  const canProceed = !isCustomReason || customReason.trim().length > 0;

  const openForm = useCallback(() => {
    setDuration(DEFAULT_DURATION);
    setReasonType(DEFAULT_REASON);
    setCustomReason('');
    setStage('form');
  }, []);
  const proceedToConfirm = useCallback(() => {
    setStage((s) => (s === 'form' && canProceed ? 'confirm' : s));
  }, [canProceed]);
  const backToForm = useCallback(() => setStage('form'), []);
  const closeAll = useCallback(() => setStage('idle'), []);

  return {
    stage,
    isOpen: stage !== 'idle',
    isConfirming: stage === 'confirm',
    duration,
    reasonType,
    customReason,
    isCustomReason,
    finalReason,
    canProceed,
    setDuration,
    setReasonType,
    setCustomReason,
    openForm,
    proceedToConfirm,
    backToForm,
    closeAll,
  };
}
