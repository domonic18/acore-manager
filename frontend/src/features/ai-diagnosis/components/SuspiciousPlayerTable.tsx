import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SuspiciousPlayer } from '@/features/ai-diagnosis/api/ai-diagnosis.api';
import { useExemptionsByGuids } from '@/features/ai-diagnosis/hooks/useAiDiagnosis';
import { useRowSelection } from '@/shared/hooks/useRowSelection';
import { MarkFalsePositiveDialog, type MarkFalsePositiveTarget } from './MarkFalsePositiveDialog';
import { SendWarningMailDialog } from './SendWarningMailDialog';
import { AiAdviceCell, ACTION_LABEL, SEVERITY_LABEL, SEVERITY_STYLE } from './AiAdviceCell';

// 可疑玩家处置表（T4.3）：卡片列表升级为可勾选表格，角色/账号富化 ID 跳转详情，
// 行内/批量标记误报（豁免白名单落库）。guid 缺失（已删除角色）降级纯文本且不可勾选。

export function SuspiciousPlayerTable({ players, realm, reportDate }: { players: SuspiciousPlayer[]; realm: string; reportDate: string }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);

  const ordered = useMemo(
    () =>
      [...players].sort((a, b) => {
        const rank = { high: 0, medium: 1, low: 2 } as Record<string, number>;
        return (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
      }),
    [players],
  );

  const selectableRows = useMemo(() => ordered.filter((p) => p.characterGuid != null), [ordered]);
  const selectable = useMemo(
    () =>
      new Map(
        selectableRows.map((p) => [p.characterGuid as number, p.character]),
      ),
    [selectableRows],
  );
  const selection = useRowSelection(selectableRows, (p) => p.characterGuid as number);
  const { selected } = selection;

  const { data: exemptions } = useExemptionsByGuids([...selectable.keys()]);
  const exemptedGuids = useMemo(() => new Set((exemptions ?? []).map((e) => e.characterGuid)), [exemptions]);

  const targets: MarkFalsePositiveTarget[] = [...selected].map((g) => ({ guid: Number(g), name: selectable.get(Number(g)) ?? `#${g}` }));

  const openDialog = (batch: boolean) => {
    setBatchMode(batch);
    setDialogOpen(true);
  };

  // 警告邮件违规概要（{reason} 占位符）：按选中玩家的最高严重度生成
  const mailReason = (() => {
    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const worst = [...players].filter((p) => p.characterGuid != null && selected.has(p.characterGuid)).sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9))[0];
    const label = worst ? (SEVERITY_LABEL[worst.severity] ?? worst.severity) : '';
    const action = worst ? (ACTION_LABEL[worst.suggestedAction] ?? '') : '';
    return action ? `${action}（${label}）` : `多次违规行为（${label}）`;
  })();

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
          <button
            onClick={() => setMailOpen(true)}
            className="rounded-md border border-amber-500/40 px-2.5 py-1 text-xs font-medium text-amber-400 hover:bg-amber-500/10"
          >
            发送警告邮件
          </button>
          <button onClick={() => selection.clear()} className="text-xs text-muted-foreground hover:text-foreground">
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
                  checked={selection.allSelected}
                  onChange={selection.toggleAll}
                  disabled={selectableRows.length === 0}
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
                        checked={selection.isSelected(p.characterGuid)}
                        onChange={() => selection.toggleOne(p.characterGuid as number)}
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
                      {p.warned && (
                        <span className="whitespace-nowrap rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-400">
                          已警告
                        </span>
                      )}
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
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => {
                            selection.selectOnly(p.characterGuid as number);
                            openDialog(false);
                          }}
                          className="whitespace-nowrap rounded-md border border-sky-500/40 px-2 py-1 text-xs font-medium text-sky-400 hover:bg-sky-500/10"
                        >
                          标记误报
                        </button>
                        <button
                          onClick={() => {
                            selection.selectOnly(p.characterGuid as number);
                            setMailOpen(true);
                          }}
                          className="whitespace-nowrap rounded-md border border-amber-500/40 px-2 py-1 text-xs font-medium text-amber-400 hover:bg-amber-500/10"
                        >
                          发警告邮件
                        </button>
                      </div>
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
        onDone={() => selection.clear()}
      />

      <SendWarningMailDialog
        targets={targets}
        reason={mailReason}
        reportDate={reportDate}
        refReport={`${realm}:${reportDate}`}
        open={mailOpen}
        onClose={() => setMailOpen(false)}
      />
    </div>
  );
}
