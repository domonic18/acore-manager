import { useState } from 'react';
import { useIpBanList, useBanIp, useUnbanIp } from '@/features/ip-ban/hooks/useIpBan';
import { IpBanTable } from '@/features/ip-ban/components/IpBanTable';
import {
  IpBanFormDialog,
  IpBanConfirmDialog,
  IpBanUnbanDialog,
  useIpBanFlow,
} from '@/features/ip-ban/components/IpBanDialogs';
import { PaginationBar } from '@/shared/components/PaginationBar';
import { toast } from '@/shared/utils/toast.util';

export default function IpBanPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [unbanTarget, setUnbanTarget] = useState('');

  const flow = useIpBanFlow();
  const { data, isLoading } = useIpBanList({ page, pageSize: 20, search: search || undefined });
  const banMutation = useBanIp();
  const unbanMutation = useUnbanIp();

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;
  const canProceed = flow.ip.trim().length > 0 && flow.canProceed;

  const handleProceedToConfirm = () => {
    if (canProceed) flow.proceedToConfirm();
  };

  const handleExecuteBan = () => {
    banMutation.mutate(
      { ip: flow.ip.trim(), duration: flow.duration, reason: flow.finalReason },
      {
        onSuccess: () => {
          flow.closeAll();
          toast.success('IP 封禁成功');
        },
        onError: (error: Error) => {
          toast.error(error.message || '封禁失败，请检查 SOAP 服务器连接');
        },
      },
    );
  };

  const handleExecuteUnban = () => {
    unbanMutation.mutate(unbanTarget, {
      onSuccess: () => {
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
          onClick={flow.openForm}
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

      <IpBanTable rows={data?.items} isLoading={isLoading} unbanPending={unbanMutation.isPending} onUnban={setUnbanTarget} />

      <PaginationBar page={page} totalPages={totalPages} total={data?.total ?? 0} onPageChange={setPage} />

      <IpBanFormDialog flow={flow} canProceed={canProceed} onProceed={handleProceedToConfirm} />
      <IpBanConfirmDialog flow={flow} banPending={banMutation.isPending} onConfirm={handleExecuteBan} onBack={flow.backToForm} />
      <IpBanUnbanDialog
        targetIp={unbanTarget}
        unbanPending={unbanMutation.isPending}
        onClose={() => setUnbanTarget('')}
        onConfirm={handleExecuteUnban}
      />
    </div>
  );
}
