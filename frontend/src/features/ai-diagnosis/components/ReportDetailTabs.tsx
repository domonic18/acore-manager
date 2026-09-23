import { useState } from 'react';
import type { AiReportDetail, ReportServerHealth, SuspiciousPlayer } from '../api/ai-diagnosis.api';

// 报告详情三 Tab（T4.1，T4.3 处置交互另行扩展）：结构化呈现 + 色块高亮，
// 替代整段 summary 文字墙：指标卡 / 风险级别徽标 / 处置 callout / 折叠证据。

const TABS = [
  { key: 'health', label: '健康' },
  { key: 'players', label: '可疑玩家' },
  { key: 'recs', label: '建议' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const SEVERITY_STYLE: Record<string, string> = {
  high: 'bg-red-500/20 text-red-400',
  medium: 'bg-amber-500/20 text-amber-400',
  low: 'bg-green-500/20 text-green-400',
};

const SEVERITY_LABEL: Record<string, string> = { high: '高危', medium: '中危', low: '低危' };

const ACTION_CALLOUT: Record<string, string> = {
  ban: 'border-l-4 border-red-500 bg-red-500/10',
  investigate: 'border-l-4 border-amber-500 bg-amber-500/10',
  warning: 'border-l-4 border-green-500 bg-green-500/10',
};

const ACTION_LABEL: Record<string, string> = { ban: '建议封禁', investigate: '建议人工核查', warning: '建议警告观察' };

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

function PlayerCard({ player }: { player: SuspiciousPlayer }) {
  const fpSignals = player.falsePositiveSignals ?? [];
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold">{player.character}</span>
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLE[player.severity] ?? 'bg-accent'}`}>
          {SEVERITY_LABEL[player.severity] ?? player.severity}
        </span>
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLE[player.suggestedAction] ?? 'bg-accent'}`}>
          {ACTION_LABEL[player.suggestedAction] ?? `建议：${player.suggestedAction}`}
        </span>
        {fpSignals.length > 0 && (
          <span className="rounded bg-sky-500/20 px-2 py-0.5 text-xs font-semibold text-sky-400">
            误报信号 ×{fpSignals.length}
          </span>
        )}
      </div>

      {fpSignals.length > 0 && (
        <div className="mt-3 rounded-r-lg border-l-4 border-sky-500 bg-sky-500/10 px-3 py-2">
          <div className="text-xs font-semibold text-sky-400">误报信号（不建议直接封禁）</div>
          <ul className="mt-1 space-y-0.5">
            {fpSignals.map((s, i) => (
              <li key={i} className="text-sm text-sky-200">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {player.suggestion && (
        <div className={`mt-3 rounded-r-lg px-3 py-2 ${ACTION_CALLOUT[player.suggestedAction] ?? 'border-l-4 border-primary bg-card'}`}>
          <div className="text-xs font-semibold text-muted-foreground">AI 处置建议</div>
          <p className="mt-0.5 text-sm leading-relaxed">{player.suggestion}</p>
        </div>
      )}

      {player.reasons && player.reasons.length > 0 && (
        <details className="mt-3" open={player.reasons.length <= 3}>
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            判定依据（{player.reasons.length}）
          </summary>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
            {player.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
        </details>
      )}

      {player.evidence && player.evidence.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">原始日志证据（{player.evidence.length}）</summary>
          <div className="mt-1 space-y-1">
            {player.evidence.slice(0, 10).map((e, i) => (
              <div key={i} className="rounded bg-accent/40 px-2 py-1 font-mono text-xs break-all">
                {e}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function PlayersTab({ players }: { players?: SuspiciousPlayer[] }) {
  if (!players || players.length === 0) {
    return <div className="py-6 text-center text-sm text-muted-foreground">本日无可疑玩家</div>;
  }
  const ordered = [...players].sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 } as Record<string, number>;
    return (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
  });
  return (
    <div className="space-y-3">
      {ordered.map((p) => (
        <PlayerCard key={p.character} player={p} />
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
      {tab === 'players' && <PlayersTab players={players} />}
      {tab === 'recs' && <RecsTab recommendations={report.contentJson?.recommendations} />}
    </div>
  );
}
