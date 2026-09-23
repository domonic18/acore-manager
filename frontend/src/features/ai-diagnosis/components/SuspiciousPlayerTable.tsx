import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import type { SuspiciousPlayer } from '../api/ai-diagnosis.api';
import { useExemptionsByGuids } from '../hooks/useAiDiagnosis';
import { MarkFalsePositiveDialog, type MarkFalsePositiveTarget } from './MarkFalsePositiveDialog';

// 可疑玩家处置表（T4.3）：卡片列表升级为可勾选表格，角色/账号富化 ID 跳转详情，
// 行内/批量标记误报（豁免白名单落库）。guid 缺失（已删除角色）降级纯文本且不可勾选。

const SEVERITY_STYLE: Record<string, string> = {
  high: 'bg-red-500/20 text-red-400',
  medium: 'bg-amber-500/20 text-amber-400',
  low: 'bg-green-500/20 text-green-400',
};

const SEVERITY_LABEL: Record<string, string> = { high: '高危', medium: '中危', low: '低危' };

const ACTION_LABEL: Record<string, string> = { ban: '建议封禁', investigate: '建议人工核查', warning: '建议警告观察' };

function AiAdviceCell({ player }: { player: SuspiciousPlayer }) {
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

export function SuspiciousPlayerTable({ players }: { players: SuspiciousPlayer[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [batchMode, setBatchMode] = useState(false);

  const ordered = useMemo(
    () =>
      [...players].sort((a, b) => {
        const rank = { high: 0, medium: 1, low: 2 } as Record<string, number>;
        return (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
      }),
    [players],
  );

  const selectable = useMemo(
    () =>
      new Map(
        ordered
          .filter((p) => p.characterGuid != null)
          .map((p) => [p.characterGuid as number, p.character]),
      ),
    [ordered],
  );
  const guids = useMemo(() => [...selectable.keys()], [selectable]);
  const { data: exemptions } = useExemptionsByGuids(guids);
  const exemptedGuids = useMemo(() => new Set((exemptions ?? []).map((e) => e.characterGuid)), [exemptions]);

  const allSelected = guids.length > 0 && guids.every((g) => selected.has(g));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(guids));
  };
  const toggleOne = (guid: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(guid)) next.delete(guid);
      else next.add(guid);
      return next;
    });
  };

  const targets: MarkFalsePositiveTarget[] = [...selected].map((g) => ({ guid: g, name: selectable.get(g) ?? `#${g}` }));

  const openDialog = (batch: boolean) => {
    setBatchMode(batch);
    setDialogOpen(true);
  };

  if (players.length === 0) {
    return <div className="py-6 text-center text-sm text-muted-foreground">本日无可疑玩家</div>;
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <span className="text-muted-foreground">已选 {selected.size} 项</span>
          <button
            onClick={() => openDialog(true)}
            className="rounded-md border border-sky-500/40 px-2.5 py-1 text-xs font-medium text-sky-400 hover:bg-sky-500/10"
          >
            批量标记误报
          </button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-muted-foreground hover:text-foreground">
            清除选择
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={guids.length === 0}
                  aria-label="全选可标记角色"
                  className="h-4 w-4 accent-primary"
                />
              </th>
              <th className="px-4 py-3 font-medium">角色</th>
              <th className="px-4 py-3 font-medium">账号</th>
              <th className="px-4 py-3 font-medium">严重度</th>
              <th className="px-4 py-3 font-medium">误报</th>
              <th className="px-4 py-3 font-medium">AI 建议</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((p) => {
              const fpSignals = p.falsePositiveSignals ?? [];
              const exempted = p.characterGuid != null && exemptedGuids.has(p.characterGuid);
              return (
                <tr key={p.character} className="border-b border-border/60 align-top transition-colors hover:bg-accent/50">
                  <td className="px-4 py-3">
                    {p.characterGuid != null ? (
                      <input
                        type="checkbox"
                        checked={selected.has(p.characterGuid)}
                        onChange={() => toggleOne(p.characterGuid as number)}
                        aria-label={`选择 ${p.character}`}
                        className="h-4 w-4 accent-primary"
                      />
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {p.characterGuid != null ? (
                      <Link to={`/characters/${p.characterGuid}`} className="text-primary hover:underline">
                        {p.character}
                      </Link>
                    ) : (
                      p.character
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {p.accountId != null ? (
                      <Link to={`/accounts/${p.accountId}`} className="text-primary hover:underline">
                        {p.accountUsername ?? p.account ?? `#${p.accountId}`}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{p.account ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLE[p.severity] ?? 'bg-accent'}`}>
                      {SEVERITY_LABEL[p.severity] ?? p.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {exempted && (
                        <span className="whitespace-nowrap rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                          已标误报
                        </span>
                      )}
                      {fpSignals.length > 0 ? (
                        <span
                          className="whitespace-nowrap rounded bg-sky-500/20 px-2 py-0.5 text-xs font-semibold text-sky-400"
                          title={fpSignals.join('\n')}
                        >
                          误报信号 ×{fpSignals.length}
                        </span>
                      ) : (
                        !exempted && <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <AiAdviceCell player={p} />
                  </td>
                  <td className="px-4 py-3">
                    {p.characterGuid != null ? (
                      <button
                        onClick={() => {
                          setSelected(new Set([p.characterGuid as number]));
                          openDialog(false);
                        }}
                        className="whitespace-nowrap rounded-md border border-sky-500/40 px-2 py-1 text-xs font-medium text-sky-400 hover:bg-sky-500/10"
                      >
                        标记误报
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <MarkFalsePositiveDialog
        targets={batchMode ? targets : targets.slice(0, 1)}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onDone={() => setSelected(new Set())}
      />
    </div>
  );
}
