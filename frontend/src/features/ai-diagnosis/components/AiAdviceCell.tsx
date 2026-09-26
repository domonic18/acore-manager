import { ChevronDown } from 'lucide-react';
import type { SuspiciousPlayer } from '@/features/ai-diagnosis/api/ai-diagnosis.api';

export const SEVERITY_STYLE: Record<string, string> = {
  high: 'bg-red-500/20 text-red-400',
  medium: 'bg-amber-500/20 text-amber-400',
  low: 'bg-green-500/20 text-green-400',
};

export const SEVERITY_LABEL: Record<string, string> = { high: '高危', medium: '中危', low: '低危' };

export const ACTION_LABEL: Record<string, string> = { ban: '建议封禁', investigate: '建议人工核查', warning: '建议警告观察' };

export function AiAdviceCell({ player }: { player: SuspiciousPlayer }) {
  const reasons = player.reasons ?? [];
  const evidence = player.evidence ?? [];
  const hasDetail = reasons.length > 0 || evidence.length > 0 || Boolean(player.suggestion);
  if (!hasDetail) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <details className="min-w-0">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLE[player.suggestedAction] ?? 'bg-accent'}`}>
          {ACTION_LABEL[player.suggestedAction] ?? `建议：${player.suggestedAction}`}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </summary>
      <div className="mt-2 space-y-2 font-mono text-xs">
        {player.suggestion && (
          <div>
            <div className="mb-0.5 font-sans font-semibold text-muted-foreground">AI 处置建议</div>
            <p className="font-sans leading-relaxed text-muted-foreground">{player.suggestion}</p>
          </div>
        )}
        {reasons.length > 0 && (
          <div>
            <div className="mb-0.5 font-sans font-semibold text-muted-foreground">依据（{reasons.length}）</div>
            <ol className="list-decimal space-y-0.5 pl-4">
              {reasons.map((r, i) => (
                <li key={i} className="break-all text-muted-foreground">
                  {r}
                </li>
              ))}
            </ol>
          </div>
        )}
        {evidence.length > 0 && (
          <div>
            <div className="mb-0.5 font-sans font-semibold text-muted-foreground">证据（{evidence.length}）</div>
            <div className="space-y-1">
              {evidence.slice(0, 10).map((e, i) => (
                <div key={i} className="break-all rounded bg-accent/40 px-1.5 py-0.5">
                  {e}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
