import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCharacterList } from '@/features/character/hooks/useCharacter';
import { raceMap, classMap } from '@/shared/constants/game.constants';

export default function CharacterListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const { data, isLoading } = useCharacterList({ page, pageSize: 20, search, includeDeleted });

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">角色管理</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
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
            className="px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleSearch}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            搜索
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">所属账号</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">等级</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">种族</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">职业</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">加载中...</td>
              </tr>
            ) : data?.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">暂无数据</td>
              </tr>
            ) : (
              data?.items.map((char) => {
                const isDeleted = !char.name;
                return (
                  <tr
                    key={char.guid}
                    className={`border-b border-border cursor-pointer ${
                      isDeleted ? 'bg-red-50/50 dark:bg-red-950/20' : 'hover:bg-accent/50'
                    }`}
                    onClick={() => !isDeleted && navigate(`/characters/${char.guid}`)}
                  >
                    <td className="px-4 py-3 font-medium">
                      {isDeleted ? (
                        <span className="text-muted-foreground line-through italic">
                          已删除（GUID: {char.guid}）
                        </span>
                      ) : (
                        char.name
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isDeleted ? (
                        <span className="text-muted-foreground">-</span>
                      ) : (
                        <button
                          className="text-primary hover:underline text-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/accounts/${char.accountId}`);
                          }}
                        >
                          {char.accountUsername}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">{char.level}</td>
                    <td className="px-4 py-3 text-muted-foreground">{raceMap[char.race] || '未知'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{classMap[char.class] || '未知'}</td>
                    <td className="px-4 py-3">
                      {isDeleted ? (
                        <span className="text-red-400 text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30">已删除</span>
                      ) : char.online ? (
                        <span className="text-green-400">在线</span>
                      ) : (
                        <span className="text-muted-foreground">离线</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">共 {data?.total} 条记录</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-md border border-border text-sm disabled:opacity-50 hover:bg-accent"
            >
              上一页
            </button>
            <span className="px-3 py-1.5 text-sm text-muted-foreground">第 {page} / {totalPages} 页</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-md border border-border text-sm disabled:opacity-50 hover:bg-accent"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
