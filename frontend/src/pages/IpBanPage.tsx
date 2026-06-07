import { useState } from 'react';
import { useIpBanList, useBanIp, useUnbanIp } from '@/features/ip-ban/hooks/useIpBan';
import { Dialog } from '@/shared/components/Dialog';
import { banReasonOptions, durationLabels } from '@/shared/constants/game.constants';
import { toast } from '@/shared/utils/toast.util';

export default function IpBanPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  // 封禁对话框状态
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [ip, setIp] = useState('');
  const [duration, setDuration] = useState('1d');
  const [reasonType, setReasonType] = useState('违规');
  const [customReason, setCustomReason] = useState('');

  // 解封对话框状态
  const [showUnbanDialog, setShowUnbanDialog] = useState(false);
  const [unbanTarget, setUnbanTarget] = useState('');

  const { data, isLoading } = useIpBanList({
    page,
    pageSize: 20,
    search: search || undefined,
  });

  const banMutation = useBanIp();
  const unbanMutation = useUnbanIp();

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;

  const isCustomReason = reasonType === '__custom__';
  const finalBanReason = isCustomReason ? customReason : reasonType;
  const canProceed = ip.trim().length > 0 && (!isCustomReason || customReason.trim().length > 0);

  const handleOpenBanDialog = () => {
    setIp('');
    setDuration('1d');
    setReasonType('违规');
    setCustomReason('');
    setShowBanDialog(true);
  };

  const handleProceedToConfirm = () => {
    if (!canProceed) return;
    setShowBanDialog(false);
    setShowConfirmDialog(true);
  };

  const handleExecuteBan = () => {
    banMutation.mutate(
      { ip: ip.trim(), duration, reason: finalBanReason },
      {
        onSuccess: () => {
          setShowConfirmDialog(false);
          setIp('');
          toast.success('IP 封禁成功');
        },
        onError: (error: Error) => {
          toast.error(error.message || '封禁失败，请检查 SOAP 服务器连接');
        },
      }
    );
  };

  const handleOpenUnbanDialog = (targetIp: string) => {
    setUnbanTarget(targetIp);
    setShowUnbanDialog(true);
  };

  const handleExecuteUnban = () => {
    unbanMutation.mutate(unbanTarget, {
      onSuccess: () => {
        setShowUnbanDialog(false);
        setUnbanTarget('');
        toast.success('解封成功');
      },
      onError: (error: Error) => {
        toast.error(error.message || '解封失败，请检查 SOAP 服务器连接');
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">IP 封禁管理</h1>
        <button
          onClick={handleOpenBanDialog}
          className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700"
        >
          封禁 IP
        </button>
      </div>

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
                    {new Date(ban.banDate).getTime() === new Date(ban.unbanDate).getTime() ? (
                      <span className="text-red-400">永久</span>
                    ) : (
                      new Date(ban.unbanDate).toLocaleString('zh-CN')
                    )}
                  </td>
                  <td className="px-4 py-3">{ban.bannedBy}</td>
                  <td className="px-4 py-3">{ban.banReason}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleOpenUnbanDialog(ban.ip)}
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

      {/* 封禁信息填写对话框 */}
      <Dialog
        open={showBanDialog}
        onClose={() => setShowBanDialog(false)}
        title="封禁 IP"
        footer={
          <>
            <button
              onClick={() => setShowBanDialog(false)}
              className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
            >
              取消
            </button>
            <button
              onClick={handleProceedToConfirm}
              disabled={!canProceed}
              className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              下一步
            </button>
          </>
        }
      >
        <div>
          <label className="block text-sm font-medium mb-1.5">IP 地址</label>
          <input
            type="text"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="请输入 IP 地址"
            className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">封禁时长</label>
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="1h">1小时</option>
            <option value="1d">1天</option>
            <option value="7d">7天</option>
            <option value="30d">30天</option>
            <option value="-1">永久</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">封禁原因</label>
          <select
            value={reasonType}
            onChange={(e) => setReasonType(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {banReasonOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {isCustomReason && (
          <div>
            <label className="block text-sm font-medium mb-1.5">自定义原因</label>
            <input
              type="text"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="请输入封禁原因"
              className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}
      </Dialog>

      {/* 二次确认对话框 */}
      <Dialog
        open={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        title="确认封禁"
        footer={
          <>
            <button
              onClick={() => {
                setShowConfirmDialog(false);
                setShowBanDialog(true);
              }}
              className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
            >
              返回修改
            </button>
            <button
              onClick={handleExecuteBan}
              disabled={banMutation.isPending}
              className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {banMutation.isPending ? '处理中...' : '确认封禁'}
            </button>
          </>
        }
      >
        <div className="text-sm text-muted-foreground mb-4">
          请再次确认以下封禁信息，操作后将立即生效：
        </div>

        <div className="space-y-3 bg-muted/50 rounded-md p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">目标 IP</span>
            <span className="font-mono font-medium">{ip}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">封禁时长</span>
            <span className="font-medium text-red-400">{durationLabels[duration]}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">封禁原因</span>
            <span className="font-medium">{finalBanReason}</span>
          </div>
        </div>
      </Dialog>

      {/* 解封确认对话框 */}
      <Dialog
        open={showUnbanDialog}
        onClose={() => setShowUnbanDialog(false)}
        title="确认解封"
        footer={
          <>
            <button
              onClick={() => setShowUnbanDialog(false)}
              className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
            >
              取消
            </button>
            <button
              onClick={handleExecuteUnban}
              disabled={unbanMutation.isPending}
              className="px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {unbanMutation.isPending ? '处理中...' : '确认解封'}
            </button>
          </>
        }
      >
        <div className="text-sm text-muted-foreground mb-4">
          请确认要解封以下 IP 地址：
        </div>
        <div className="bg-muted/50 rounded-md p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">目标 IP</span>
            <span className="font-mono font-medium">{unbanTarget}</span>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
