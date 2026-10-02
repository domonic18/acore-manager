import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CopyButton } from '@/shared/components/CopyButton';
import { Markdown } from '@/shared/components/Markdown';
import { markdownToHtml } from '@/shared/utils/markdown.util';
import type { AnalysisConclusion } from '../api/ai-analysis.api';
import { GameRefText } from './GameRefText';

// 定向分析结论卡：建议徽章 + 误报信号 + 违规聚合 + markdown 全文（可复制）+ 证据摘录。

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

      <p className="text-sm leading-relaxed text-muted-foreground">
        <GameRefText text={conclusion.suggestionReason} />
      </p>

      {conclusion.markdown && (
        <details open>
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">回复全文（可复制 Markdown / HTML）</summary>
          <div className="mt-2 rounded-md border border-border bg-muted/30 px-3 py-2">
            <div className="mb-1 flex justify-end gap-2">
              <CopyButton
                formats={[
                  { key: 'markdown', label: '复制 Markdown', text: () => Promise.resolve(conclusion.markdown ?? '') },
                  {
                    key: 'html',
                    label: '复制 HTML',
                    text: () => Promise.resolve(markdownToHtml(conclusion.markdown ?? '')),
                    richHtml: true,
                  },
                ]}
              />
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
