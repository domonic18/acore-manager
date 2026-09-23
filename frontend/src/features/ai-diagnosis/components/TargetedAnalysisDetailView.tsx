import { Loader2 } from 'lucide-react';
import { useTargetedDetail } from '../hooks/useTargetedAnalysis';
import type { AnalysisConclusion } from '../api/ai-analysis.api';
import { ConclusionCard } from './TargetedAnalysisRunner';
import { STATUS_LABEL, STATUS_STYLE } from './TargetedHistoryList';

// 定向分析详情（T4.6）：整页回看落库结论，替代弹窗交互（内容长时可滚动、可新标签打开）。

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

export function TargetedAnalysisDetailView({ id }: { id: number }) {
  const { data: detail, isLoading, isError } = useTargetedDetail(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
      </div>
    );
  }
  if (isError || !detail) {
    return <div className="py-10 text-center text-sm text-destructive">详情加载失败</div>;
  }

  const cj = detail.conclusionJson;
  const failed = detail.status === 'failed' || (cj != null && 'error' in cj);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">
          <span className="mr-2 rounded bg-accent/60 px-1.5 py-0.5 text-xs align-middle text-muted-foreground">
            {detail.subjectType === 'character' ? '角色' : '账号'}
          </span>
          {detail.subjectName}
        </h1>
        <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[detail.status] ?? 'bg-accent'}`}>
          {STATUS_LABEL[detail.status] ?? detail.status}
        </span>
        <span className="text-xs text-muted-foreground">
          #{detail.id} · {detail.realm} · {detail.timeFrom} ~ {detail.timeTo} · 触发人 {detail.triggeredBy} · {formatTime(detail.createdAt)}
          {detail.tokenUsage?.total ? ` · tokens ${detail.tokenUsage.total}` : ''}
        </span>
      </div>

      {failed ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {cj != null && 'error' in cj ? cj.error : '分析失败，未产出结论'}
        </div>
      ) : cj == null || detail.status === 'running' ? (
        <div className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          该分析仍在进行中，尚未落库结论，可稍后刷新重试。
        </div>
      ) : (
        <ConclusionCard conclusion={{ ...cj, markdown: detail.conclusionMarkdown ?? cj.markdown } as AnalysisConclusion} analysisId={detail.id} />
      )}
    </div>
  );
}
