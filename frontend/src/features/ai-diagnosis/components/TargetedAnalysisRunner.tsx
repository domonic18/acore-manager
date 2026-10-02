import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { TimeRangeFilter } from '@/shared/components/TimeRangeFilter';
import { useDefaultRealm } from '@/shared/hooks/useDefaultRealm';
import { toast } from '@/shared/utils/toast.util';
import { aiAnalysisApi, type TargetedSubjectType } from '../api/ai-analysis.api';

// 定向分析发起（异步化）：批量对象（每行一个，≤10）+ 时间范围，提交建行并触发 manager-job
// 异步执行；过程与结论在下方历史列表轮询查看，详情页可回看。

const MAX_SUBJECTS = 10;

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function TargetedAnalysisRunner({ onFinished }: { onFinished?: () => void }) {
  const location = useLocation();
  const preset = (location.state ?? {}) as {
    subjectType?: TargetedSubjectType;
    subjectName?: string;
    /** 多对象预填（违规巡检深度分析联动），优先于 subjectName */
    subjectNames?: string[];
    timeFrom?: string;
    timeTo?: string;
  };

  const [subjectType, setSubjectType] = useState<TargetedSubjectType>(preset.subjectType ?? 'character');
  const [namesText, setNamesText] = useState(preset.subjectNames?.join('\n') ?? preset.subjectName ?? '');
  const defaultRealm = useDefaultRealm();
  const [realm, setRealm] = useState('');
  const [timeFrom, setTimeFrom] = useState(preset.timeFrom ?? localDate(new Date(Date.now() - 6 * 86400000)));
  const [timeTo, setTimeTo] = useState(preset.timeTo ?? localDate(new Date()));
  const [banReason, setBanReason] = useState('');
  const [bannedBy, setBannedBy] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (defaultRealm) setRealm((prev) => prev || defaultRealm);
  }, [defaultRealm]);

  const names = namesText.split('\n').map((s) => s.trim()).filter(Boolean);
  const spanDays = Math.round((new Date(timeTo).getTime() - new Date(timeFrom).getTime()) / 86400000);
  const canSubmit =
    !submitting && names.length > 0 && names.length <= MAX_SUBJECTS && realm.trim() !== '' && spanDays >= 0 && spanDays <= 31;

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      const items = await aiAnalysisApi.create({
        realm: realm.trim(),
        subjectType,
        subjectNames: names,
        timeFrom,
        timeTo,
        ...(banReason.trim()
          ? { banContext: { reason: banReason.trim(), ...(bannedBy.trim() ? { bannedBy: bannedBy.trim() } : {}) } }
          : {}),
      });
      toast.success(`已提交 ${items.length} 项分析，完成后可在历史列表查看结论`);
      setNamesText('');
      onFinished?.();
    } catch (err) {
      setError((err as Error).message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex gap-2">
        {(['character', 'account'] as TargetedSubjectType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSubjectType(t)}
            disabled={submitting}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              subjectType === t ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            {t === 'character' ? '按角色' : '按账号'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-muted-foreground">
            {subjectType === 'character' ? '角色名' : '账号名'}（每行一个，最多 {MAX_SUBJECTS} 个，已填 {names.length}）
          </label>
          <textarea
            value={namesText}
            onChange={(e) => setNamesText(e.target.value)}
            rows={3}
            placeholder={subjectType === 'character' ? '如 Unparalleled\n如 Nolove' : '如 HY2038'}
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">服务器</label>
          <input
            value={realm}
            onChange={(e) => setRealm(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">时间范围（跨度 ≤31 天）</label>
          <TimeRangeFilter
            label="分析区间"
            value={{ from: timeFrom, to: timeTo }}
            onChange={(v) => {
              if (v) {
                setTimeFrom(v.from);
                setTimeTo(v.to);
              } else {
                // 表单两个日期必填，清除时回落到默认近 7 天
                setTimeFrom(localDate(new Date(Date.now() - 6 * 86400000)));
                setTimeTo(localDate(new Date()));
              }
            }}
          />
        </div>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted-foreground">封禁背景（可选，申诉场景建议填写）</summary>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
            placeholder="封禁理由"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            value={bannedBy}
            onChange={(e) => setBannedBy(e.target.value)}
            placeholder="封禁操作人（可选）"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </details>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {names.length > MAX_SUBJECTS ? (
          <span className="text-xs text-destructive">单次最多提交 {MAX_SUBJECTS} 个对象</span>
        ) : spanDays < 0 || spanDays > 31 ? (
          <span className="text-xs text-destructive">时间跨度须为 0-31 天</span>
        ) : (
          <span className="text-xs text-muted-foreground">提交后由后台任务异步分析，全程自动落库，无需停留在页面等待</span>
        )}
        <button
          onClick={() => void submit()}
          disabled={!canSubmit}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {submitting ? '提交中…' : '提交分析'}
        </button>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
