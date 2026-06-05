import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccountList } from '@/features/account/hooks/useAccount';

export default function AccountListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const { data, isLoading } = useAccountList({ page, pageSize: 20, search });

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  return (
    
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">账号管理</h1>
          <div className="flex gap-2">
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
          </div>
        </div>

        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-card">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">ID</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">用户名</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">邮箱</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">GM等级</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">最后登录</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">最后IP</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    加载中...
                  </td>
                </tr>
              ) : data?.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    暂无数据
                  </td>
                </tr>
              ) : (
                data?.items.map((account) => (
                  <tr
                    key={account.id}
                    className="border-b border-border hover:bg-accent/50 cursor-pointer"
                    onClick={() => navigate(`/accounts/${account.id}`)}
                  >
                    <td className="px-4 py-3">{account.id}</td>
                    <td className="px-4 py-3 font-medium">{account.username}</td>
                    <td className="px-4 py-3 text-muted-foreground">{account.email || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs ${
                        account.gmlevel >= 3
                          ? 'bg-red-500/20 text-red-400'
                          : account.gmlevel >= 2
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : account.gmlevel >= 1
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {account.gmlevel || '玩家'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {account.online ? (
                        <span className="text-green-400">在线</span>
                      ) : (
                        <span className="text-muted-foreground">离线</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {account.lastLogin
                        ? new Date(account.lastLogin).toLocaleString('zh-CN')
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {account.lastIp || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/accounts/${account.id}`);
                        }}
                        className="text-primary text-sm hover:underline"
                      >
                        详情
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              共 {data?.total} 条记录
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-md border border-border text-sm disabled:opacity-50 hover:bg-accent"
              >
                上一页
              </button>
              <span className="px-3 py-1.5 text-sm text-muted-foreground">
                第 {page} / {totalPages} 页
              </span>
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
