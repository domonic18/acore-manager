import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from '@/shared/components/Dialog';
import { toast } from '@/shared/utils/toast.util';
import { usePermission } from '@/shared/hooks/usePermission';
import { useDeleteTargetedAnalysis, useTargetedDetail, useUpdateTargetedAnalysis } from '../hooks/useTargetedAnalysis';
import type { AnalysisConclusion } from '../api/ai-analysis.api';
import { ConclusionCard } from './TargetedAnalysisRunner';
import { RemarkEditDialog } from './RemarkEditDialog';
import { STATUS_LABEL, STATUS_STYLE } from './TargetedHistoryList';

// 定向分析详情（T4.6/T4.7）：整页回看落库结论；gm3 可编辑处置备注、润色结论 Markdown、删除记录。

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

export function TargetedAnalysisDetailView({ id }: { id: number }) {
  const navigate = useNavigate();
  const { hasGmLevel } = usePermission();
  const { data: detail, isLoading, isError } = useTargetedDetail(id);
  const updateAnalysis = useUpdateTargetedAnalysis();
  const deleteAnalysis = useDeleteTargetedAnalysis();

  const [remarkOpen, setRemarkOpen] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

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
  const concluded = !failed && cj != null && detail.status !== 'running';
  const canManage = hasGmLevel(3);
  const deleteConfirmed = confirmText.trim() === String(detail.id);

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

        {canManage && (
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setRemarkOpen(true)}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              编辑备注
            </button>
            {concluded && !polishing && (
              <button
                onClick={() => {
                  setDraft(detail.conclusionMarkdown ?? '');
                  setPolishing(true);
                }}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
              >
                润色
              </button>
            )}
            <button
              onClick={() => {
                setConfirmText('');
                setConfirmOpen(true);
              }}
              className="rounded-md border border-red-500/40 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/10"
            >
              删除
            </button>
          </div>
        )}
      </div>

      {detail.gmRemark && (
        <div className="rounded-lg border border-border bg-card p-3 text-sm">
          <span className="font-medium">GM 备注：</span>
          {detail.gmRemark}
        </div>
      )}

      {failed ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {cj != null && 'error' in cj ? cj.error : '分析失败，未产出结论'}
        </div>
      ) : !concluded ? (
        <div className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          该分析仍在进行中，尚未落库结论，可稍后刷新重试。
        </div>
      ) : polishing ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">编辑后保存将覆盖落库结论 Markdown（审计留痕）</div>
            <div className="flex gap-2">
              <button onClick={() => setPolishing(false)} className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-accent">
                取消
              </button>
              <button
                onClick={() =>
                  updateAnalysis.mutate(
                    { id: detail.id, patch: { conclusionMarkdown: draft } },
                    {
                      onSuccess: () => {
                        setPolishing(false);
                        toast.success('润色已保存');
                      },
                      onError: (err: Error) => toast.error(err.message || '保存失败'),
                    },
                  )
                }
                disabled={updateAnalysis.isPending}
                className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
              >
                {updateAnalysis.isPending ? '保存中...' : '保存润色'}
              </button>
            </div>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={20}
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      ) : (
        <ConclusionCard conclusion={{ ...cj, markdown: detail.conclusionMarkdown ?? cj.markdown } as AnalysisConclusion} analysisId={detail.id} />
      )}

      <RemarkEditDialog
        open={remarkOpen}
        title="编辑处置备注"
        initial={detail.gmRemark}
        pending={updateAnalysis.isPending}
        onClose={() => setRemarkOpen(false)}
        onSubmit={(text) =>
          updateAnalysis.mutate(
            { id: detail.id, patch: { gmRemark: text } },
            {
              onSuccess: () => {
                toast.success('备注已保存');
                setRemarkOpen(false);
              },
              onError: (err: Error) => toast.error(err.message || '保存失败'),
            },
          )
        }
      />

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="删除定向分析记录"
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmOpen(false)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent">
              取消
            </button>
            <button
              onClick={() =>
                deleteAnalysis.mutate(detail.id, {
                  onSuccess: () => {
                    toast.success('记录已删除');
                    setConfirmOpen(false);
                    navigate('/ai-diagnosis/targeted');
                  },
                  onError: (err: Error) => toast.error(err.message || '删除失败'),
                })
              }
              disabled={!deleteConfirmed || deleteAnalysis.isPending}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deleteAnalysis.isPending ? '删除中...' : '确认删除'}
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <p>
            将永久删除 <span className="font-medium">#{detail.id} {detail.subjectName}</span> 的定向分析记录，删除操作会记录审计日志。
          </p>
          <p className="text-muted-foreground">请输入记录编号 {detail.id} 以确认：</p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={String(detail.id)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>
      </Dialog>
    </div>
  );
}
