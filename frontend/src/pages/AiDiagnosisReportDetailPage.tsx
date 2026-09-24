import { Link, useParams } from 'react-router-dom';
import { useReportDetail } from '@/features/ai-diagnosis/hooks/useAiDiagnosis';
import { ReportDetailTabs } from '@/features/ai-diagnosis/components/ReportDetailTabs';
import { ReportManageActions } from '@/features/ai-diagnosis/components/ReportManageActions';

export default function AiDiagnosisReportDetailPage() {
  const { realm = '', date = '' } = useParams();
  const { data: report, isLoading, isError } = useReportDetail(realm, date);

  if (isLoading) {
    return <div className="py-8 text-center text-muted-foreground">加载中...</div>;
  }
  if (isError || !report) {
    return (
      <div className="space-y-4">
        <Link to="/ai-diagnosis" className="text-sm text-primary hover:underline">
          ← 返回报告列表
        </Link>
        <div className="py-8 text-center text-muted-foreground">报告不存在</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/ai-diagnosis" className="text-sm text-primary hover:underline">
          ← 返回报告列表
        </Link>
        <ReportManageActions realm={report.realm} date={report.reportDate} remark={report.gmRemark} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">
          {report.realm} 巡检报告（{report.reportDate}）
        </h1>
        <span
          className={`rounded px-2 py-0.5 text-sm font-medium ${
            report.healthScore < 60 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
          }`}
        >
          健康分 {report.healthScore}
        </span>
        <span className="text-xs text-muted-foreground">
          trigger={report.generatedBy}
          {report.tokenUsage?.total ? ` · tokens ${report.tokenUsage.total}` : ''}
        </span>
      </div>

      {report.gmRemark && (
        <div className="rounded-lg border border-border bg-card p-3 text-sm">
          <span className="font-medium">GM 备注：</span>
          {report.gmRemark}
        </div>
      )}

      <ReportDetailTabs report={report} />
    </div>
  );
}
