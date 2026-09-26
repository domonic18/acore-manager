import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SimpleTable, type SimpleColumn } from '@/shared/components/SimpleTable';

interface Row {
  id: number;
  name: string;
}

const columns: SimpleColumn<Row>[] = [
  { key: 'id', header: 'ID', render: (r) => r.id },
  { key: 'name', header: '名称', render: (r) => r.name },
];

const rows: Row[] = [
  { id: 1, name: 'alice' },
  { id: 2, name: 'bob' },
];

describe('SimpleTable', () => {
  it('renders headers and rendered cells', () => {
    render(<SimpleTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('名称')).toBeInTheDocument();
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
  });

  it('renders emptyText when rows is empty', () => {
    render(<SimpleTable columns={columns} rows={[]} rowKey={(r) => r.id} emptyText="没有账号" />);
    expect(screen.getByText('没有账号')).toBeInTheDocument();
    expect(screen.queryByText('alice')).not.toBeInTheDocument();
  });

  it('renders loading row ahead of rows', () => {
    render(<SimpleTable columns={columns} rows={rows} rowKey={(r) => r.id} loading />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
    expect(screen.queryByText('alice')).not.toBeInTheDocument();
  });

  it('fires onRowClick with the clicked row', () => {
    const onRowClick = vi.fn();
    render(<SimpleTable columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={onRowClick} />);
    fireEvent.click(screen.getByText('bob'));
    expect(onRowClick).toHaveBeenCalledWith({ id: 2, name: 'bob' });
  });

  it('dense mode uses compact cell padding', () => {
    render(<SimpleTable columns={columns} rows={rows} rowKey={(r) => r.id} dense />);
    expect(screen.getByText('alice').closest('td')).toHaveClass('px-3', 'py-2');
  });
});
