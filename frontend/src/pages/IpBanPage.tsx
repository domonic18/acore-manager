import { useState } from 'react';
import { useIpBanList, useBanIp, useUnbanIp } from '@/features/ip-ban/hooks/useIpBan';

export default function IpBanPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [ip, setIp] = useState('');
  const [duration, setDuration] = useState('1d');
  const [reason, setReason] = useState('违规');

  const { data, isLoading } = useIpBanList({
    page,
    pageSize: 20,
    search: search || undefined,
  });

  const banMutation = useBanIp();
  const unbanMutation = useUnbanIp();

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  const handleBan = async () => {
    if (!ip.trim()) return;
    await banMutation.mutateAsync({ ip, duration, reason });
    setShowForm(false);
    setIp('');
  };

  const handleUnban = (ip: string) => {
    if (!confirm(`确认解封 IP ${ip}？`)) return;
    unbanMutation.mutate(ip);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">IP 封禁管理</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          {showForm ? '取消' : '封禁 IP'}
        </button>
      </div>

      {showForm && (
        <div className="flex flex-wrap gap-2 p-4 rounded-lg border border-border bg-card">
          <input
            type="text"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="IP 地址"
            className="px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="1h">1小时</option>
            <option value="1d">1天</option>
            <option value="7d">7天</option>
            <option value="30d">30天</option>
            <option value="-1">永久</option>
          </select>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="封禁原因"
            className="px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleBan}
            disabled={banMutation.isPending}
            className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {banMutation.isPending ? '处理中...' : '确认封禁'}
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="搜索 IP"
          className="px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">IP 地址</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">封禁时间</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">解封时间</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">操作人</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">原因</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  加载中...
                </td>
              </tr>
            ) : data?.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  暂无封禁记录
                </td>
              </tr>
            ) : (
              data?.items.map((ban, index) => (
                <tr key={index} className="border-b border-border hover:bg-accent/50">
                  <td className="px-4 py-3 font-mono text-xs">{ban.ip}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(ban.banDate).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(ban.unbanDate).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3">{ban.bannedBy}</td>
                  <td className="px-4 py-3">{ban.banReason}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleUnban(ban.ip)}
                      disabled={unbanMutation.isPending}
                      className="px-3 py-1 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      解封
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
          <p className="text-sm text-muted-foreground">共 {data?.total} 条记录</p>
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
