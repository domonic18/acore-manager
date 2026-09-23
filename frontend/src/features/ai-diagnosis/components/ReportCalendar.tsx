import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AiReportSummary } from '../api/ai-diagnosis.api';

// 巡检月历：有报告的日期显示健康色点（绿≥80 正常 / 黄 60-79 需关注 / 红<60 异常），
// 点击有报告的日期跳转当日报告详情；月份可前后切换，默认落在最近一份报告所在月。

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

function dotClass(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-yellow-500';
  return 'bg-red-500';
}

const pad = (n: number): string => String(n).padStart(2, '0');

function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function ReportCalendar({ reports, realm }: { reports: AiReportSummary[]; realm: string }) {
  const navigate = useNavigate();
  const today = new Date();

  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const syncedRef = useRef(false);

  // 报告异步到达后且用户尚未翻月时，落到最近一份报告所在月，保证首屏就能看到色点
  useEffect(() => {
    if (syncedRef.current || reports.length === 0) return;
    syncedRef.current = true;
    const latest = reports.reduce((a, b) => (a.reportDate > b.reportDate ? a : b));
    setView(parseKey(latest.reportDate));
  }, [reports]);

  const byDate = new Map(reports.map((r) => [r.reportDate, r]));
  const latestKey = reports.length > 0 ? reports.reduce((a, b) => (a.reportDate > b.reportDate ? a : b)).reportDate : null;

  const year = view.getFullYear();
  const month = view.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // 周一为首列
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(offset), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const move = (delta: number): void => {
    syncedRef.current = true;
    setView(new Date(year, month + delta, 1));
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-semibold">巡检日历</h2>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => move(-1)}
            aria-label="上一月"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[6.5rem] text-center text-sm font-medium">
            {year} 年 {month + 1} 月
          </span>
          <button
            onClick={() => move(1)}
            aria-label="下一月"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              syncedRef.current = true;
              setView(latestKey ? parseKey(latestKey) : new Date(today.getFullYear(), today.getMonth(), 1));
            }}
            className="ml-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            最新
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day == null) return <div key={`blank-${i}`} />;
          const key = `${year}-${pad(month + 1)}-${pad(day)}`;
          const report = byDate.get(key);
          const date = new Date(year, month, day);
          return (
            <button
              key={key}
              disabled={!report}
              onClick={() => report && navigate(`/ai-diagnosis/${encodeURIComponent(realm)}/${key}`)}
              title={report ? `${key} 健康分 ${report.healthScore}，点击查看详情` : undefined}
              className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-md text-sm transition-colors ${
                report ? 'cursor-pointer hover:bg-accent' : 'cursor-default text-muted-foreground/60'
              } ${sameDay(date, today) ? 'ring-1 ring-primary' : ''}`}
            >
              <span>{day}</span>
              {report && <span className={`h-1.5 w-1.5 rounded-full ${dotClass(report.healthScore)}`} />}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />正常（≥80）
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />需关注（60-79）
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />异常（&lt;60）
        </span>
        <span className="ml-auto">今日以圆环标注</span>
      </div>
    </div>
  );
}
