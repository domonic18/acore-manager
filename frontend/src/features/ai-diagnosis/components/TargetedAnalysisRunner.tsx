import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertCircle, ChevronDown, Loader2, Wrench, X } from 'lucide-react';
import { CopyButton } from '@/shared/components/CopyButton';
import { Markdown } from '@/shared/components/Markdown';
import { TimeRangeFilter } from '@/shared/components/TimeRangeFilter';
import { useDefaultRealm } from '@/features/system-config/hooks/useSystemConfig';
import { streamTargetedAnalysis, type AnalysisConclusion, type TargetedAnalysisInput, type TargetedSubjectType, type ToolResultEvent } from '../api/ai-analysis.api';

// 定向分析发起（T4.6，需求 3.8 申诉研判）：单一对象 + 时间范围，SSE 过程展示，
// 结论卡渲染 markdown 全文并支持一键复制。单次分析约 1-4 分钟，可中途停止。

const SUGGESTION_STYLE: Record<string, string> = {
  maintain: 'bg-slate-500/20 text-slate-300',
  lift: 'bg-green-500/20 text-green-400',
  downgrade: 'bg-amber-500/20 text-amber-400',
  manual_review: 'bg-sky-500/20 text-sky-400',
};

const SUGGESTION_LABEL: Record<string, string> = {
  maintain: '维持封禁',
  lift: '建议解封',
  downgrade: '降级处理',
  manual_review: '人工复核',
};

interface ToolRowItem {
  name: string;
  status: 'running' | 'done' | 'error';
  rowCount: number | null;
  durationMs: number | null;
  error?: string | null;
}

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ToolRow({ tool }: { tool: ToolRowItem }) {
  const running = tool.status === 'running';
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1.5 text-xs">
      {running ? (
        <Loader2 className="h-3 w-3 animate-spin text-primary" />
      ) : tool.status === 'error' ? (
        <AlertCircle className="h-3 w-3 text-destructive" />
      ) : (
        <Wrench className="h-3 w-3 text-primary" />
      )}
      <span className="font-mono text-foreground/80">{tool.name}</span>
      <span className="ml-auto text-muted-foreground">
        {running
          ? '查询中…'
          : tool.status === 'error'
            ? tool.error || '失败'
            : tool.rowCount != null
              ? `${tool.rowCount} 行${tool.durationMs != null ? ` · ${tool.durationMs}ms` : ''}`
              : '已完成'}
      </span>
    </div>
  );
}

export function ConclusionCard({ conclusion, analysisId }: { conclusion: AnalysisConclusion; analysisId: number }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const fpSignals = conclusion.falsePositiveSignals ?? [];
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold">
          {conclusion.subjectName}
          <span className="ml-2 text-xs text-muted-foreground">
            {conclusion.timeRange.from} ~ {conclusion.timeRange.to} · #{analysisId}
          </span>
        </span>
        <span className={`ml-auto rounded px-2 py-0.5 text-xs font-semibold ${SUGGESTION_STYLE[conclusion.suggestion] ?? 'bg-accent'}`}>
          {SUGGESTION_LABEL[conclusion.suggestion] ?? conclusion.suggestion}
        </span>
      </div>

      {fpSignals.length > 0 && (
        <div className="rounded-r-lg border-l-4 border-sky-500 bg-sky-500/10 px-3 py-2">
          <div className="text-xs font-semibold text-sky-400">未排除的误报信号（不建议直接维持封禁）</div>
          <ul className="mt-1 space-y-0.5">
            {fpSignals.map((s, i) => (
              <li key={i} className="text-sm text-sky-200">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {conclusion.violations.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {conclusion.violations.map((v, i) => (
            <span
              key={i}
              className={`rounded px-2 py-0.5 text-xs font-medium ${v.confirmed ? 'bg-red-500/20 text-red-400' : 'bg-muted text-muted-foreground'}`}
              title={v.note}
            >
              {v.type} ×{v.count}
              {v.confirmed ? '' : '（疑似）'}
            </span>
          ))}
        </div>
      )}

      <p className="text-sm leading-relaxed text-muted-foreground">{conclusion.suggestionReason}</p>

      {conclusion.markdown && (
        <details open>
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">回复全文（可复制）</summary>
          <div className="mt-2 rounded-md border border-border bg-muted/30 px-3 py-2">
            <div className="mb-1 flex justify-end">
              <CopyButton getText={() => Promise.resolve(conclusion.markdown ?? '')} />
            </div>
            <Markdown content={conclusion.markdown} />
          </div>
        </details>
      )}

      {conclusion.evidence.length > 0 && (
        <div>
          <button onClick={() => setShowEvidence((v) => !v)} className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
            <ChevronDown className={`h-3 w-3 transition-transform ${showEvidence ? 'rotate-180' : ''}`} />
            证据摘录（{conclusion.evidence.length}）
          </button>
          {showEvidence && (
            <div className="mt-1 space-y-1">
              {conclusion.evidence.map((e, i) => (
                <div key={i} className="rounded bg-accent/40 px-2 py-1 font-mono text-xs break-all">
                  <span className="mr-1.5 font-semibold text-primary">{e.source}</span>
                  {e.quote}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TargetedAnalysisRunner({ onFinished }: { onFinished?: () => void }) {
  const location = useLocation();
  const preset = (location.state ?? {}) as { subjectType?: TargetedSubjectType; subjectName?: string };

  const [subjectType, setSubjectType] = useState<TargetedSubjectType>(preset.subjectType ?? 'character');
  const [subjectName, setSubjectName] = useState(preset.subjectName ?? '');
  const defaultRealm = useDefaultRealm();
  const [realm, setRealm] = useState('');
  const [timeFrom, setTimeFrom] = useState(localDate(new Date(Date.now() - 6 * 86400000)));
  const [timeTo, setTimeTo] = useState(localDate(new Date()));
  const [banReason, setBanReason] = useState('');
  const [bannedBy, setBannedBy] = useState('');

  const [running, setRunning] = useState(false);
  const [tools, setTools] = useState<ToolRowItem[]>([]);
  const [text, setText] = useState('');
  const [conclusion, setConclusion] = useState<AnalysisConclusion | null>(null);
  const [analysisId, setAnalysisId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (textRef.current) textRef.current.scrollTop = textRef.current.scrollHeight;
  }, [text, running]);

  useEffect(() => {
    if (defaultRealm) setRealm((prev) => prev || defaultRealm);
  }, [defaultRealm]);

  const spanDays = Math.round((new Date(timeTo).getTime() - new Date(timeFrom).getTime()) / 86400000);
  const canSubmit =
    !running && subjectName.trim() !== '' && realm.trim() !== '' && spanDays >= 0 && spanDays <= 31;

  const start = (): void => {
    const input: TargetedAnalysisInput = {
      realm: realm.trim(),
      subjectType,
      subjectName: subjectName.trim(),
      timeFrom,
      timeTo,
      ...(banReason.trim()
        ? { banContext: { reason: banReason.trim(), ...(bannedBy.trim() ? { bannedBy: bannedBy.trim() } : {}) } }
        : {}),
    };
    setRunning(true);
    setTools([]);
    setText('');
    setConclusion(null);
    setAnalysisId(null);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const openTool = (name: string): void => {
      setTools((prev) => {
        const pending = prev.find((t) => t.name === name && t.status === 'running');
        if (pending) return prev;
        return [...prev, { name, status: 'running', rowCount: null, durationMs: null }];
      });
    };
    const closeTool = (name: string, patch: Partial<ToolResultEvent>): void => {
      setTools((prev) =>
        prev.map((t) => (t.name === name && t.status === 'running' ? { ...t, status: patch.error ? 'error' : 'done', rowCount: patch.rowCount ?? null, durationMs: patch.durationMs ?? null, error: patch.error ?? null } : t)),
      );
    };
    streamTargetedAnalysis(
      input,
      {
        onDelta: (chunk) => setText((prev) => prev + chunk),
        onToolCall: (d) => openTool(d.name),
        onToolResult: (d) => closeTool(d.name, d),
        onDone: (d) => {
          setConclusion(d.conclusion);
          setAnalysisId(d.analysisId);
          setRunning(false);
          onFinished?.();
        },
        onError: (d) => {
          setError(d.message);
          if (d.analysisId != null) setAnalysisId(d.analysisId);
          setRunning(false);
          onFinished?.();
        },
      },
      controller.signal,
    ).catch((err: Error) => {
      if (err.name === 'AbortError') {
        setError('已停止本次分析');
      } else {
        setError(err.message || '连接失败');
      }
      setRunning(false);
      onFinished?.();
    });
  };

  const stop = (): void => {
    abortRef.current?.abort();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex gap-2">
          {(['character', 'account'] as TargetedSubjectType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSubjectType(t)}
              disabled={running}
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
            <label className="mb-1 block text-xs text-muted-foreground">{subjectType === 'character' ? '角色名' : '账号名'}</label>
            <input
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder={subjectType === 'character' ? '如 Unparalleled' : '如 HY2038'}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
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
        <div className="mt-3 flex items-center gap-3">
          {spanDays < 0 || spanDays > 31 ? (
            <span className="text-xs text-destructive">时间跨度须为 0-31 天</span>
          ) : (
            <span className="text-xs text-muted-foreground">分析约需 1-4 分钟，期间可随时停止</span>
          )}
          <div className="ml-auto flex gap-2">
            {running && (
              <button onClick={stop} className="flex items-center gap-1 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10">
                <X className="h-3.5 w-3.5" /> 停止
              </button>
            )}
            <button
              onClick={start}
              disabled={!canSubmit}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              {running ? '分析中…' : '发起分析'}
            </button>
          </div>
        </div>
      </div>

      {(running || tools.length > 0 || text) && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            {running && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
            取证过程
          </div>
          {tools.length > 0 && (
            <div className="mb-3 space-y-1">
              {tools.map((t, i) => (
                <ToolRow key={`${t.name}-${i}`} tool={t} />
              ))}
            </div>
          )}
          {text && (
            <div ref={textRef} className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground">
              {text}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {conclusion && <ConclusionCard conclusion={conclusion} analysisId={analysisId ?? 0} />}
    </div>
  );
}
