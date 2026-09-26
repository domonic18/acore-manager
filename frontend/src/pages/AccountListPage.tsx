import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccountList } from '@/features/account/hooks/useAccount';
import { AccountTable, type AccountSortState } from '@/features/account/components/AccountTable';
import { TimeRangeFilter, type TimeRange } from '@/shared/components/TimeRangeFilter';
import { PaginationBar } from '@/shared/components/PaginationBar';

export default function AccountListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sort, setSort] = useState<AccountSortState>({});
  const [joinRange, setJoinRange] = useState<TimeRange | null>(null);
  const [loginRange, setLoginRange] = useState<TimeRange | null>(null);

  const { data, isLoading } = useAccountList({
    page,
    pageSize: 20,
    search,
    sortBy: sort.sortBy,
    sortOrder: sort.sortOrder,
    joinedFrom: joinRange?.from,
    joinedTo: joinRange?.to,
    loginFrom: loginRange?.from,
    loginTo: loginRange?.to,
  });

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleReset = () => {
    setSearchInput('');
    setSearch('');
    setJoinRange(null);
    setLoginRange(null);
    setPage(1);
  };

  const hasFilters = Boolean(search || joinRange || loginRange);

  const handleSort = (field: string) => {
    setSort((prev) => {
      if (prev.sortBy !== field) {
        return { sortBy: field, sortOrder: 'DESC' };
      }
      if (prev.sortOrder === 'DESC') {
        return { sortBy: field, sortOrder: 'ASC' };
      }
      return {};
    });
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">账号管理</h1>
        <p className="text-sm text-muted-foreground">共 {data?.total ?? 0} 个账号</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="搜索账号/IP/邮箱"
          className="px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          搜索
        </button>
        <TimeRangeFilter
          label="注册时间"
          value={joinRange}
          onChange={(v) => {
            setJoinRange(v);
            setPage(1);
          }}
        />
        <TimeRangeFilter
          label="最后登录"
          value={loginRange}
          onChange={(v) => {
            setLoginRange(v);
            setPage(1);
          }}
        />
        {hasFilters && (
          <button onClick={handleReset} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            重置
          </button>
        )}
      </div>

      <AccountTable rows={data?.items ?? []} loading={isLoading} sort={sort} onSort={handleSort} onOpen={(id) => navigate(`/accounts/${id}`)} />

      <PaginationBar page={page} totalPages={totalPages} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  );
}
