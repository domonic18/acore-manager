import { useBanlist } from '@/features/banlist/hooks/useBanlist';
import { BanlistTable } from '@/features/banlist/components/BanlistTable';

export default function BanlistPage() {
  const { data: bans, isLoading } = useBanlist();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">封号列表</h1>

      <BanlistTable rows={bans ?? []} loading={isLoading} />
    </div>
  );
}
