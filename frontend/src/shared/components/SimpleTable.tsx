import type { ReactNode } from 'react';

export interface SimpleColumn<Row> {
  key: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
  className?: string;
}

interface SimpleTableProps<Row> {
  columns: SimpleColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row, index: number) => string | number;
  onRowClick?: (row: Row) => void;
  loading?: boolean;
  emptyText?: string;
  dense?: boolean;
  tableClassName?: string;
  rowClassName?: (row: Row, index: number) => string;
}

// 列表页/详情页通用表格：统一 rounded-lg border 容器与单元格留白（dense = 详情页紧凑态）
export function SimpleTable<Row>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading = false,
  emptyText = '暂无数据',
  dense = false,
  tableClassName,
  rowClassName,
}: SimpleTableProps<Row>) {
  const pad = dense ? 'px-3 py-2' : 'px-4 py-3';
  const colSpan = columns.length;
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <table className={`w-full text-sm ${tableClassName ?? ''}`}>
        <thead>
          <tr className="border-b border-border bg-card">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-left font-medium text-muted-foreground ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={colSpan} className="px-4 py-8 text-center text-muted-foreground">
                加载中...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="px-4 py-8 text-center text-muted-foreground">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-border ${onRowClick ? 'hover:bg-accent/50 cursor-pointer' : ''} ${
                  rowClassName?.(row, i) ?? ''
                }`}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`${pad} ${col.className ?? ''}`}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
