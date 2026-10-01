import type { OperationLog } from '@/features/audit-log/api/audit-log.api';
import { SimpleTable, type SimpleColumn } from '@/shared/components/SimpleTable';

interface AuditLogTableProps {
  rows: OperationLog[];
  loading: boolean;
}

export function AuditLogTable({ rows, loading }: AuditLogTableProps) {
  const columns: SimpleColumn<OperationLog>[] = [
    {
      key: 'createdAt',
      header: '时间',
      render: (log) => (
        <span className="text-muted-foreground">{new Date(log.createdAt).toLocaleString('zh-CN')}</span>
      ),
    },
    { key: 'operatorName', header: '操作人', render: (log) => log.operatorName },
    {
      key: 'operation',
      header: '操作',
      render: (log) => (
        <span className="inline-flex px-2 py-0.5 rounded text-xs bg-secondary text-secondary-foreground">
          {log.operation}
        </span>
      ),
    },
    { key: 'target', header: '目标', render: (log) => <span className="text-muted-foreground">{log.target || '-'}</span> },
    { key: 'details', header: '详情', render: (log) => <span className="text-muted-foreground">{log.details || '-'}</span> },
  ];

  return <SimpleTable columns={columns} rows={rows} rowKey={(log) => log.id} loading={loading} />;
}
