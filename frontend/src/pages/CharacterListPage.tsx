import { useState } from 'react';
import { useCharacterList } from '@/features/character/hooks/useCharacter';
import { CharacterTable } from '@/features/character/components/CharacterTable';
import { PaginationBar } from '@/shared/components/PaginationBar';

const ONLINE_ONLY_KEY = 'acm.characters.onlineOnly';

function readOnlineOnlyPref(): boolean {
  return localStorage.getItem(ONLINE_ONLY_KEY) !== '0';
}

export default function CharacterListPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [onlineOnly, setOnlineOnly] = useState(readOnlineOnlyPref);
  const { data, isLoading } = useCharacterList({ page, pageSize: 20, search, includeDeleted, online: onlineOnly });

  const handleOnlineOnlyChange = (value: boolean) => {
    setOnlineOnly(value);
    localStorage.setItem(ONLINE_ONLY_KEY, value ? '1' : '0');
    setPage(1);
  };

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">角色管理</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="inline-flex rounded-md border border-border p-0.5">
            <button
              onClick={() => handleOnlineOnlyChange(true)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                onlineOnly ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-accent-foreground'
              }`}
            >
              仅在线
            </button>
            <button
              onClick={() => handleOnlineOnlyChange(false)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                !onlineOnly ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-accent-foreground'
              }`}
            >
              全部
            </button>
          </div>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(e) => { setIncludeDeleted(e.target.checked); setPage(1); }}
              className="rounded border-border"
            />
            显示已删除角色
          </label>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="搜索角色名"
            className="min-w-[8rem] flex-1 px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring sm:w-56 sm:flex-none"
          />
          <button
            onClick={handleSearch}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            搜索
          </button>
        </div>
      </div>

      <CharacterTable rows={data?.items ?? []} loading={isLoading} />

      <PaginationBar page={page} totalPages={totalPages} total={data?.total ?? 0} onPageChange={setPage} />
    </div>
  );
}
