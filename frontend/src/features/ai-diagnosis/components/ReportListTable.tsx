import { useNavigate } from 'react-router-dom';
import type { AiReportSummary } from '@/features/ai-diagnosis/api/ai-diagnosis.api';
import { SimpleTable, type SimpleColumn } from '@/shared/components/SimpleTable';

interface ReportListTableProps {
  rows: AiReportSummary[];
  loading: boolean;
  emptyText: string;
}

export function ReportListTable({ rows, loading, emptyText }: ReportListTableProps) {
  const navigate = useNavigate();

  const columns: SimpleColumn<AiReportSummary>[] = [
    {
      key: 'reportDate',
      header: '日期',
      className: 'whitespace-nowrap',
      render: (r) => r.reportDate,
    },
    { key: 'realm', header: '服务器', render: (r) => r.realm },
    {
      key: 'healthScore',
      header: '健康分',
      render: (r) => (
        <span
          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
            r.healthScore < 60 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
          }`}
        >
          {r.healthScore}
        </span>
      ),
    },
    {
      key: 'status',
      header: '状态',
      render: (r) => (
        <span
          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
            r.status === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}
        >
          {r.status === 'ok' ? '正常' : r.status}
        </span>
      ),
    },
    { key: 'generatedBy', header: '触发', render: (r) => <span className="text-muted-foreground">{r.generatedBy}</span> },
    {
      key: 'summary',
      header: '摘要',
      className: 'max-w-[24rem] truncate',
      render: (r) => <span className="text-muted-foreground">{r.summary}</span>,
    },
  ];

  return (
    <SimpleTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      onRowClick={(r) => navigate(`/ai-diagnosis/${r.realm}/${r.reportDate}`)}
      loading={loading}
      emptyText={emptyText}
    />
  );
}
