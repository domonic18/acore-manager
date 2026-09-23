import { useState } from 'react';
import type { AiReportDetail, ReportServerHealth } from '../api/ai-diagnosis.api';
import { aiDiagnosisApi } from '../api/ai-diagnosis.api';
import { Markdown } from '@/shared/components/Markdown';
import { CopyButton } from '@/shared/components/CopyButton';
import { SuspiciousPlayerTable } from './SuspiciousPlayerTable';

// 报告详情四 Tab（T4.1 + T4.2 全文 + T4.3 处置表）：结构化呈现 + 色块高亮，
// 替代整段 summary 文字墙：指标卡 / 风险级别徽标 / 处置 callout / 折叠证据。

const TABS = [
  { key: 'health', label: '健康' },
  { key: 'players', label: '可疑玩家' },
  { key: 'recs', label: '建议' },
  { key: 'full', label: '全文' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function entryText(e: unknown): string {
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function MetricCard({ label, count }: { label: string; count: number }) {
  const tone = count === 0 ? 'text-green-400' : 'text-red-400';
  return (
    <div className="flex-1 rounded-lg border border-border bg-card px-4 py-3">
      <div className={`text-2xl font-bold ${tone}`}>{count}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function HealthTab({ serverHealth, summary }: { serverHealth?: ReportServerHealth; summary: string }) {
  const sections = [
    { label: '崩溃', items: serverHealth?.crashes ?? [] },
    { label: '错误', items: serverHealth?.errors ?? [] },
    { label: '认证异常', items: serverHealth?.authAnomalies ?? [] },
  ];
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        {sections.map((s) => (
          <MetricCard key={s.label} label={s.label} count={s.items.length} />
        ))}
      </div>
      <blockquote className="rounded-r-lg border-l-4 border-primary bg-card px-4 py-3 text-sm leading-relaxed">
        {summary}
      </blockquote>
      {sections
        .filter((s) => s.items.length > 0)
        .map((s) => (
          <details key={s.label} className="rounded-lg border border-border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
              {s.label}明细（{s.items.length}）
            </summary>
            <ul className="space-y-1 px-3 pb-3">
              {s.items.slice(0, 20).map((item, i) => (
                <li key={i} className="rounded bg-accent/40 px-2 py-1 font-mono text-xs break-all">
                  {entryText(item)}
                </li>
              ))}
            </ul>
          </details>
        ))}
    </div>
  );
}

function RecsTab({ recommendations }: { recommendations?: string[] }) {
  if (!recommendations || recommendations.length === 0) {
    return <div className="py-6 text-center text-sm text-muted-foreground">无建议</div>;
  }
  return (
    <ol className="space-y-3">
      {recommendations.map((r, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
            {i + 1}
          </span>
          <p className="rounded-r-lg border-l-4 border-primary bg-card px-3 py-2 text-sm leading-relaxed">{r}</p>
        </li>
      ))}
    </ol>
  );
}

function FullTab({ realm, reportDate, contentMarkdown }: { realm: string; reportDate: string; contentMarkdown: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">Markdown 原文，与落库版本一致，可直接粘贴到论坛或文档</div>
        <CopyButton getText={() => aiDiagnosisApi.fetchReportMarkdown(realm, reportDate)} className="shrink-0" />
      </div>
      <div className="rounded-lg border border-border bg-card px-4 py-3">
        <Markdown content={contentMarkdown} />
      </div>
    </div>
  );
}

export function ReportDetailTabs({ report }: { report: AiReportDetail }) {
  const [tab, setTab] = useState<TabKey>('health');
  const players = report.contentJson?.suspiciousPlayers ?? [];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {t.key === 'players' && players.length > 0 && `（${players.length}）`}
          </button>
        ))}
      </div>
      {tab === 'health' && <HealthTab serverHealth={report.contentJson?.serverHealth} summary={report.summary} />}
      {tab === 'players' && <SuspiciousPlayerTable players={players} realm={report.realm} reportDate={report.reportDate} />}
      {tab === 'recs' && <RecsTab recommendations={report.contentJson?.recommendations} />}
      {tab === 'full' && <FullTab realm={report.realm} reportDate={report.reportDate} contentMarkdown={report.contentMarkdown} />}
    </div>
  );
}
