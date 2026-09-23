import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from '@/shared/components/Dialog';
import { toast } from '@/shared/utils/toast.util';
import { usePermission } from '@/shared/hooks/usePermission';
import { useDeleteReport } from '../hooks/useAiDiagnosis';

// 报告管理操作（T4.7 前置切片）：删除需 gmlevel≥3 + 输入报告日期二次确认。
// 后续备注编辑 / Markdown 润色归入本组件。

export function ReportManageActions({ realm, date }: { realm: string; date: string }) {
  const navigate = useNavigate();
  const { hasGmLevel } = usePermission();
  const deleteReport = useDeleteReport();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  if (!hasGmLevel(3)) return null;

  const confirmed = confirmText.trim() === date;
  const deleting = deleteReport.isPending;

  const handleDelete = () => {
    deleteReport.mutate(
      { realm, date },
      {
        onSuccess: () => {
          toast.success('报告已删除');
          setConfirmOpen(false);
          navigate('/ai-diagnosis');
        },
        onError: (err: Error) => toast.error(err.message || '删除失败'),
      },
    );
  };

  return (
    <>
      <button
        onClick={() => {
          setConfirmText('');
          setConfirmOpen(true);
        }}
        className="rounded-md border border-red-500/40 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/10"
      >
        删除报告
      </button>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="删除巡检报告"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmOpen(false)}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
            >
              取消
            </button>
            <button
              onClick={handleDelete}
              disabled={!confirmed || deleting}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deleting ? '删除中...' : '确认删除'}
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-sm">
          <p>
            将永久删除报告 <span className="font-medium">
              {realm} / {date}
            </span>
            ，删除操作会记录审计日志。
          </p>
          <p className="text-muted-foreground">请输入报告日期 {date} 以确认：</p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={date}
            className="w-full rounded-md border border-border bg-card px-3 py-2 outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>
      </Dialog>
    </>
  );
}
