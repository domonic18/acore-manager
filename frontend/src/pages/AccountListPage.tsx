import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccountList } from '@/features/account/hooks/useAccount';
import { AccountTable, type AccountSortState } from '@/features/account/components/AccountTable';
import { TimeRangeFilter, type TimeRange } from '@/shared/components/TimeRangeFilter';
import { PaginationBar } from '@/shared/components/PaginationBar';
import { Skeleton } from '@/shared/components/Skeleton';
import { useListQueryParams } from '@/shared/hooks/useListQueryParams';

// 筛选/排序/翻页状态持久化在 URL：进出详情返回后恢复，深链可直达。
// 搜索提交与重置产生历史记录（replace:false），其余变更 replace。
export default function AccountListPage() {
  const navigate = useNavigate();
  const { params, set } = useListQueryParams();

  const search = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const sortBy = params.get('sortBy') ?? undefined;
  const sortOrder = params.get('sortOrder') ?? undefined;
  const sort: AccountSortState = { sortBy, sortOrder: sortOrder === 'ASC' || sortOrder === 'DESC' ? sortOrder : undefined };
  const joinRange: TimeRange | null =
    params.get('joinedFrom') || params.get('joinedTo')
      ? { from: params.get('joinedFrom') ?? '', to: params.get('joinedTo') ?? '' }
      : null;
  const loginRange: TimeRange | null =
    params.get('loginFrom') || params.get('loginTo')
      ? { from: params.get('loginFrom') ?? '', to: params.get('loginTo') ?? '' }
      : null;
  const [searchInput, setSearchInput] = useState(search);

  const { data, isLoading } = useAccountList({
    page,
    pageSize: 20,
    search,
    sortBy,
    sortOrder,
    joinedFrom: joinRange?.from,
    joinedTo: joinRange?.to,
    loginFrom: loginRange?.from,
    loginTo: loginRange?.to,
  });

  const handleSearch = () => {
    set({ q: searchInput || null, page: null }, { replace: false });
  };

  const handleReset = () => {
    setSearchInput('');
    set({ q: null, page: null, sortBy: null, sortOrder: null, joinedFrom: null, joinedTo: null, loginFrom: null, loginTo: null }, { replace: false });
  };

  const hasFilters = Boolean(search || joinRange || loginRange);

  const handleSort = (field: string) => {
    if (sortBy !== field) set({ sortBy: field, sortOrder: 'DESC', page: null });
    else if (sortOrder === 'DESC') set({ sortBy: field, sortOrder: 'ASC', page: null });
    else set({ sortBy: null, sortOrder: null, page: null });
  };

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">账号管理</h1>
        {isLoading ? (
          <Skeleton className="h-5 w-24" />
        ) : (
          <p className="text-sm text-muted-foreground">共 {data?.total ?? 0} 个账号</p>
        )}
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
            set({ joinedFrom: v?.from ?? null, joinedTo: v?.to ?? null, page: null });
          }}
        />
        <TimeRangeFilter
          label="最后登录"
          value={loginRange}
          onChange={(v) => {
            set({ loginFrom: v?.from ?? null, loginTo: v?.to ?? null, page: null });
          }}
        />
        {hasFilters && (
          <button onClick={handleReset} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            重置
          </button>
        )}
      </div>

      <AccountTable rows={data?.items ?? []} loading={isLoading} sort={sort} onSort={handleSort} onOpen={(id) => navigate(`/accounts/${id}`)} />

      <PaginationBar page={page} totalPages={totalPages} total={data?.total ?? 0} onPageChange={(p) => set({ page: p > 1 ? p : null })} loading={isLoading} />
    </div>
  );
}
