import { useState } from 'react';
import { ChevronDown, ExternalLink, Plus } from 'lucide-react';
import type { FpScenarioItem, SampleItem } from '../api/ai-diagnosis.api';
import { useFpScenarios, useRemoveFpScenario, useRemoveSample, useSamples } from '../hooks/useAiDiagnosis';
import { FpScenarioFormDialog } from './FpScenarioFormDialog';
import { SampleFormDialog } from './SampleFormDialog';

// 样本与场景库（巡查优化 2026-10）：两个 tab——
// 1) 巡查样本库：goodcase/badcase 标注语料（回归评测与提示词校准依据）；
// 2) 误报场景库：任务传送点/已知误报场景（explain 引擎 quest/map 信号数据源，GM 可线上维护）。

const SAMPLE_LABEL_STYLE: Record<string, string> = {
  cheat: 'bg-red-500/20 text-red-400',
  false_positive: 'bg-green-500/20 text-green-400',
  pending: 'bg-slate-500/20 text-slate-300',
};

const SAMPLE_LABEL_TEXT: Record<string, string> = {
  cheat: '确认作弊',
  false_positive: '确认误报',
  pending: '待定',
};

const SOURCE_TEXT: Record<string, string> = {
  auto_ban: '模块自动封禁',
  appeal: '申诉结论',
  deep_analysis: '深度分析',
  inspection: '巡检',
  gm: 'GM 录入',
};

function SampleTable({ rows, onEdit }: { rows: SampleItem[]; onEdit: (s: SampleItem) => void }) {
  const remove = useRemoveSample();
  const [expanded, setExpanded] = useState<number | null>(null);

  const handleRemove = (s: SampleItem): void => {
    if (window.confirm(`确认删除样本「${s.characterName}（${s.detectedDate ?? '无日期'}）」？`)) {
      remove.mutate(s.id, {
        onError: (err) => window.alert((err as Error).message || '删除失败'),
      });
    }
  };

  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">暂无样本，点击右上角「录入样本」开始积累语料</p>;
  return (
    <div className="space-y-2">
      {rows.map((s) => (
        <div key={s.id} className="rounded-lg border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${SAMPLE_LABEL_STYLE[s.label] ?? 'bg-accent'}`}>
              {SAMPLE_LABEL_TEXT[s.label] ?? s.label}
            </span>
            <span className="text-sm font-medium">{s.characterName}</span>
            <span className="text-xs text-muted-foreground">
              {s.realm}
              {s.characterGuid ? ` · guid ${s.characterGuid}` : ''} · {s.detectedDate ?? '日期未知'} · {SOURCE_TEXT[s.source] ?? s.source}
            </span>
            <span className="ml-auto flex items-center gap-1.5 text-xs">
              {s.refUrl && (
                <a href={s.refUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                  引用 <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <button onClick={() => onEdit(s)} className="text-muted-foreground hover:text-foreground">
                编辑
              </button>
              <button onClick={() => handleRemove(s)} className="text-destructive hover:opacity-80">
                删除
              </button>
            </span>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{s.summary}</p>
          {s.evidenceJson.length > 0 && (
            <div className="mt-1.5">
              <button onClick={() => setExpanded((v) => (v === s.id ? null : s.id))} className="flex items-center gap-1 text-xs text-muted-foreground">
                <ChevronDown className={`h-3 w-3 transition-transform ${expanded === s.id ? 'rotate-180' : ''}`} />
                证据摘录（{s.evidenceJson.length}）
              </button>
              {expanded === s.id && (
                <div className="mt-1 space-y-1">
                  {s.evidenceJson.map((e, i) => (
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
      ))}
    </div>
  );
}

function ScenarioTable({ rows, onEdit }: { rows: FpScenarioItem[]; onEdit: (s: FpScenarioItem) => void }) {
  const remove = useRemoveFpScenario();
  const handleRemove = (s: FpScenarioItem): void => {
    if (window.confirm(`确认删除场景「${s.violationType} × 地图${s.mapId ?? '不限'}${s.questId ? ` × 任务${s.questId}` : ''}」？`)) {
      remove.mutate(s.id, {
        onError: (err) => window.alert((err as Error).message || '删除失败'),
      });
    }
  };

  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">暂无场景，点击右上角「录入场景」添加任务传送点</p>;
  return (
    <div className="space-y-2">
      {rows.map((s) => (
        <div key={s.id} className="rounded-lg border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-sky-500/20 px-2 py-0.5 font-mono text-xs font-semibold text-sky-400">{s.violationType}</span>
            <span className="text-sm">
              地图 {s.mapId ?? '不限'}
              {s.questId ? <span className="ml-1.5 text-xs text-muted-foreground">任务 {s.questId}</span> : null}
              {s.spots?.length ? <span className="ml-1.5 text-xs text-muted-foreground">{s.spots.length} 个坐标点</span> : null}
            </span>
            <span className="ml-auto flex items-center gap-1.5 text-xs">
              <button onClick={() => onEdit(s)} className="text-muted-foreground hover:text-foreground">
                编辑
              </button>
              <button onClick={() => handleRemove(s)} className="text-destructive hover:opacity-80">
                删除
              </button>
            </span>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{s.reason}</p>
          {s.spots && s.spots.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {s.spots.map((p, i) => (
                <span key={i} className="rounded bg-accent/40 px-1.5 py-0.5 font-mono text-xs">
                  ({p.x}, {p.y}, {p.z}) ±{p.radiusYards}y
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function SampleRegistryView() {
  const [tab, setTab] = useState<'samples' | 'scenarios'>('samples');
  const [labelFilter, setLabelFilter] = useState('');
  const [q, setQ] = useState('');
  const samples = useSamples({ label: labelFilter || undefined, q: q.trim() || undefined });
  const scenarios = useFpScenarios();

  const [sampleDialog, setSampleDialog] = useState<{ open: boolean; editing: SampleItem | null }>({ open: false, editing: null });
  const [scenarioDialog, setScenarioDialog] = useState<{ open: boolean; editing: FpScenarioItem | null }>({ open: false, editing: null });

  const tabBtn = (active: boolean): string =>
    `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
      active ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent'
    }`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setTab('samples')} className={tabBtn(tab === 'samples')}>
          巡查样本库（{samples.data?.length ?? '…'}）
        </button>
        <button type="button" onClick={() => setTab('scenarios')} className={tabBtn(tab === 'scenarios')}>
          误报场景库（{scenarios.data?.length ?? '…'}）
        </button>
        <div className="ml-auto flex items-center gap-2">
          {tab === 'samples' ? (
            <>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜角色/摘要…"
                className="w-40 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
              <select
                value={labelFilter}
                onChange={(e) => setLabelFilter(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">全部标注</option>
                <option value="cheat">确认作弊</option>
                <option value="false_positive">确认误报</option>
                <option value="pending">待定</option>
              </select>
              <button
                onClick={() => setSampleDialog({ open: true, editing: null })}
                className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> 录入样本
              </button>
            </>
          ) : (
            <button
              onClick={() => setScenarioDialog({ open: true, editing: null })}
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> 录入场景
            </button>
          )}
        </div>
      </div>

      {tab === 'samples' ? (
        samples.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">加载中…</p>
        ) : samples.isError ? (
          <p className="py-6 text-center text-sm text-destructive">{(samples.error as Error).message}</p>
        ) : (
          <SampleTable rows={samples.data ?? []} onEdit={(s) => setSampleDialog({ open: true, editing: s })} />
        )
      ) : scenarios.isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">加载中…</p>
      ) : scenarios.isError ? (
        <p className="py-6 text-center text-sm text-destructive">{(scenarios.error as Error).message}</p>
      ) : (
        <ScenarioTable rows={scenarios.data ?? []} onEdit={(s) => setScenarioDialog({ open: true, editing: s })} />
      )}

      <SampleFormDialog open={sampleDialog.open} editing={sampleDialog.editing} onClose={() => setSampleDialog({ open: false, editing: null })} />
      <FpScenarioFormDialog
        open={scenarioDialog.open}
        editing={scenarioDialog.editing}
        onClose={() => setScenarioDialog({ open: false, editing: null })}
      />
    </div>
  );
}
