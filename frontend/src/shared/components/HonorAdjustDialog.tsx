import { useEffect, useState } from 'react';
import { Dialog } from './Dialog';
import { toast } from '@/shared/utils/toast.util';
import { honorAdjustApi, type HonorAdjustMode, type HonorAdjustResult } from '../api/honor-adjust';

// 荣誉调整弹窗（gm3）：清零 / 设值 / 减值三模式，二次确认后经 SOAP `.wardenhonor` 执行。
// 仅对在线玩家生效，SOAP 回执原文呈现（player not online 等错误一目了然）。

export interface HonorAdjustDialogProps {
  characterName: string;
  /** 弹窗标题前缀，默认「荣誉调整」 */
  titlePrefix?: string;
  open: boolean;
  onClose: () => void;
}

type Phase = 'edit' | 'confirm' | 'result';

const MODES: Array<{ key: HonorAdjustMode | 'clear'; label: string; hint: string }> = [
  { key: 'clear', label: '清零', hint: '可花费荣誉归 0' },
  { key: 'set', label: '设值', hint: '设为指定值' },
  { key: 'sub', label: '减值', hint: '扣减指定值（下限 0）' },
];

export function HonorAdjustDialog({ characterName, titlePrefix = '荣誉调整', open, onClose }: HonorAdjustDialogProps) {
  const [phase, setPhase] = useState<Phase>('edit');
  const [mode, setMode] = useState<HonorAdjustMode | 'clear'>('clear');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<HonorAdjustResult | null>(null);

  useEffect(() => {
    if (open) {
      setPhase('edit');
      setMode('clear');
      setValue('');
      setReason('');
      setResult(null);
    }
  }, [open]);

  const parsedValue = mode === 'clear' ? 0 : Number.parseInt(value, 10);
  const valueValid = mode === 'clear' || (Number.isInteger(parsedValue) && parsedValue >= 0);

  const submit = (): void => {
    setPending(true);
    honorAdjustApi
      .adjust({ characterName, mode: mode === 'clear' ? 'set' : mode, value: parsedValue, ...(reason.trim() ? { reason: reason.trim() } : {}) })
      .then((res) => {
        setResult(res);
        setPhase('result');
        if (res.ok) toast.success(`${characterName} 荣誉已调整`);
        else toast.error('调整未生效，请查看回执');
      })
      .catch((err: Error) => toast.error(err.message || '调整失败'))
      .finally(() => setPending(false));
  };

  const modeLabel = MODES.find((m) => m.key === mode)?.label ?? '';
  const footer =
    phase === 'edit' ? (
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
          取消
        </button>
        <button
          onClick={() => setPhase('confirm')}
          disabled={!valueValid}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一步
        </button>
      </div>
    ) : phase === 'confirm' ? (
      <div className="flex justify-end gap-2">
        <button onClick={() => setPhase('edit')} disabled={pending} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
          返回修改
        </button>
        <button
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? '执行中...' : `确认${modeLabel}`}
        </button>
      </div>
    ) : (
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
          完成
        </button>
      </div>
    );

  return (
    <Dialog open={open} onClose={onClose} title={`${titlePrefix} — ${characterName}`} footer={footer}>
      {phase === 'edit' && (
        <div className="space-y-3 text-sm">
          <div className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            仅对在线玩家生效（离线目标会返回 not online）。清零/设值作用于可花费荣誉；当日荣誉计数自然日自动清零。
          </div>
          <div className="flex gap-2">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={`flex-1 rounded-md px-3 py-2 text-center transition-colors ${
                  mode === m.key ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                <div className="text-sm font-medium">{m.label}</div>
                <div className="mt-0.5 text-[11px] opacity-70">{m.hint}</div>
              </button>
            ))}
          </div>
          {mode !== 'clear' && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{mode === 'set' ? '目标荣誉值' : '扣减数值'}</label>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                placeholder="非负整数"
                className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
              />
              {!valueValid && <p className="mt-1 text-xs text-red-400">请输入非负整数</p>}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">处置原因（可选，记入审计）</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 300))}
              placeholder="如：战场互刷处罚"
              className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      )}

      {phase === 'confirm' && (
        <div className="space-y-3 text-sm">
          <p>
            确认对 <span className="font-semibold">{characterName}</span> 执行{' '}
            <span className="font-semibold text-red-400">
              {modeLabel}
              {mode === 'clear' ? '' : ` ${parsedValue}`}
            </span>{' '}
            ？操作会记录审计日志，不可撤销。
          </p>
          {reason.trim() && (
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">原因：{reason.trim()}</div>
          )}
        </div>
      )}

      {phase === 'result' && result && (
        <div className="space-y-2 text-sm">
          <p className={result.ok ? 'text-green-500' : 'text-red-400'}>{result.ok ? '调整已受理' : '调整未生效'}</p>
          <div className="rounded-md bg-muted/40 px-3 py-2 font-mono text-xs break-all">{result.message || '（无回执）'}</div>
        </div>
      )}
    </Dialog>
  );
}
