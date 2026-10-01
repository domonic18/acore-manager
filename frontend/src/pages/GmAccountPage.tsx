import { useState } from 'react';
import { useGmAccountList } from '@/features/account/hooks/useAccount';
import { GmAccountTable } from '@/features/account/components/GmAccountTable';

export default function GmAccountPage() {
  const { data: gmAccounts, isLoading } = useGmAccountList();
  const [search, setSearch] = useState('');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">GM 账号列表</h1>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索账号 / 邮箱 / 服务器"
          className="px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <GmAccountTable gms={gmAccounts} loading={isLoading} search={search} />
    </div>
  );
}
