import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

// 通用时间范围筛选器（样式参考 SquadSight）：触发按钮 + 弹层（预设 chips / 双月历框选 / 原生 date 微调）。
// 值为 'yyyy-MM-dd' 本地日期字符串，结束日含当天全天；供账号列表等多个页面复用。

export interface TimeRange {
  from: string;
  to: string;
}

export interface TimeRangePreset {
  label: string;
  days: number;
}

const pad = (n: number): string => String(n).padStart(2, '0');

function formatKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

export const DEFAULT_TIME_PRESETS: TimeRangePreset[] = [
  { label: '今天', days: 1 },
  { label: '最近7天', days: 7 },
  { label: '最近30天', days: 30 },
  { label: '最近90天', days: 90 },
  { label: '最近一年', days: 365 },
];

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

interface Draft {
  from: string | null;
  to: string | null;
}

function MonthPane({
  month,
  draft,
  hover,
  onPick,
  onHover,
}: {
  month: Date;
  draft: Draft;
  hover: string | null;
  onPick: (key: string) => void;
  onHover: (key: string | null) => void;
}) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const offset = (new Date(year, m, 1).getDay() + 6) % 7; // 周一首列
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(offset),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const todayKey = formatKey(new Date());

  const inPreview = (key: string): boolean => {
    if (draft.from && !draft.to && hover) {
      const [a, b] = [draft.from, hover].sort();
      return key >= a && key <= b;
    }
    return false;
  };

  return (
    <div>
      <div className="mb-1 text-center text-xs font-medium">
        {year} 年 {m + 1} 月
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-0.5">
            {w}
          </div>
        ))}
      </div>
      <div className="mt-0.5 grid grid-cols-7 gap-0.5" onMouseLeave={() => onHover(null)}>
        {cells.map((day, i) => {
          if (day == null) return <div key={`blank-${i}`} />;
          const key = `${year}-${pad(m + 1)}-${pad(day)}`;
          const isEndpoint = key === draft.from || key === draft.to;
          const inRange =
            draft.from && draft.to ? key > draft.from && key < draft.to : inPreview(key);
          return (
            <button
              key={key}
              type="button"
              onMouseEnter={() => onHover(key)}
              onClick={() => onPick(key)}
              className={`flex h-8 items-center justify-center rounded text-xs transition-colors ${
                isEndpoint
                  ? 'bg-primary font-medium text-primary-foreground'
                  : inRange
                    ? 'bg-primary/15 text-foreground'
                    : 'hover:bg-accent'
              } ${key === todayKey && !isEndpoint ? 'ring-1 ring-primary' : ''}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TimeRangeFilter({
  label,
  value,
  onChange,
  presets = DEFAULT_TIME_PRESETS,
  placeholder = '全部时间',
}: {
  label: string;
  value: TimeRange | null;
  onChange: (v: TimeRange | null) => void;
  presets?: TimeRangePreset[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({ from: null, to: null });
  const [hover, setHover] = useState<string | null>(null);
  const today = new Date();
  const [leftMonth, setLeftMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const rootRef = useRef<HTMLDivElement>(null);

  const openPanel = () => {
    setDraft({ from: value?.from ?? null, to: value?.to ?? null });
    const anchor = value?.from?.split('-').map(Number);
    setLeftMonth(
      anchor ? new Date(anchor[0], anchor[1] - 1, 1) : new Date(today.getFullYear(), today.getMonth(), 1),
    );
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // 第二次点选完成框选即自动提交；早于起点或第三次点击则重新锚定起点
  const pick = (key: string) => {
    if (!draft.from || draft.to || key < draft.from) {
      setDraft({ from: key, to: null });
      return;
    }
    onChange({ from: draft.from, to: key });
    setOpen(false);
  };

  const canApply = draft.from != null && draft.to != null && draft.from <= draft.to;
  const dirty = draft.from != null || draft.to != null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={openPanel}
        className={`inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm hover:bg-accent ${
          value ? 'border-primary/50 text-foreground' : 'border-border text-muted-foreground'
        }`}
      >
        <Calendar className="h-4 w-4 shrink-0" />
        <span className="text-muted-foreground">{label}</span>
        <span className={value ? 'font-medium' : ''}>
          {value ? `${value.from} ~ ${value.to}` : placeholder}
        </span>
        {value && (
          <span
            role="button"
            aria-label={`清除${label}筛选`}
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            className="rounded p-0.5 hover:bg-accent"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-2 w-[min(92vw,620px)] rounded-lg border border-border bg-card p-3 shadow-xl">
          <div className="flex gap-2">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  onChange({ from: formatKey(addDays(today, -(p.days - 1))), to: formatKey(today) });
                  setOpen(false);
                }}
                className="flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold hover:bg-accent hover:text-foreground"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MonthPane month={leftMonth} draft={draft} hover={hover} onPick={pick} onHover={setHover} />
            <MonthPane
              month={new Date(leftMonth.getFullYear(), leftMonth.getMonth() + 1, 1)}
              draft={draft}
              hover={hover}
              onPick={pick}
              onHover={setHover}
            />
          </div>

          <div className="mt-3 flex items-center gap-1 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setLeftMonth(new Date(leftMonth.getFullYear(), leftMonth.getMonth() - 1, 1))}
              aria-label="上一月"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setLeftMonth(new Date(leftMonth.getFullYear(), leftMonth.getMonth() + 1, 1))}
              aria-label="下一月"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="ml-auto flex items-center gap-2">
              <input
                type="date"
                value={draft.from ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value || null }))}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-xs text-muted-foreground">~</span>
              <input
                type="date"
                value={draft.to ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value || null }))}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
              {value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent"
                >
                  清除
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!canApply) return;
                  onChange({ from: draft.from!, to: draft.to! });
                  setOpen(false);
                }}
                disabled={!canApply}
                className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                确定
              </button>
            </div>
          </div>
          {dirty && !canApply && (
            <div className="mt-2 text-center text-[11px] text-muted-foreground">
              已选 {draft.from ?? '...'} ~ {draft.to ?? '...'}，点击结束日期完成框选
            </div>
          )}
        </div>
      )}
    </div>
  );
}
