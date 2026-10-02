import { Link } from 'react-router-dom';
import { RACE_MAP, CLASS_MAP } from '@/shared/constants/game';
import { Skeleton } from '@/shared/components/Skeleton';
import type { MultiBox, MultiBoxGroup } from '../api/dashboard.api';

// 多开检测卡：同 IP 多账号同时在线（AC 单账号仅单角色在线）
// 注意：account.last_ip 为最近登录 IP，NAT 同出口可能误判，属治理参考信号

function groupCharCount(group: MultiBoxGroup): number {
  return group.accounts.reduce((sum, a) => sum + a.characters.length, 0);
}

function CharacterChip({ character }: { character: MultiBoxGroup['accounts'][number]['characters'][number] }) {
  const raceName = RACE_MAP[character.race]?.name || `种族${character.race}`;
  const className = CLASS_MAP[character.class]?.name || `职业${character.class}`;
  return (
    <Link
      to={`/characters/${character.guid}`}
      title={`${raceName} · ${className}`}
      className="inline-flex items-center gap-1 rounded border border-border/60 bg-background px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
    >
      <span className="font-medium text-foreground">{character.name}</span>
      <span>{character.level}级</span>
    </Link>
  );
}

function GroupRow({ group }: { group: MultiBoxGroup }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-xs text-amber-500">{group.ip}</span>
        <span className="text-xs text-muted-foreground">
          {group.accounts.length} 账号 · {groupCharCount(group)} 角色
        </span>
      </div>
      <div className="space-y-1.5">
        {group.accounts.map((account) => (
          <div key={account.accountId} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              to={`/accounts/${account.accountId}`}
              className="text-xs font-medium text-foreground transition-colors hover:text-primary"
            >
              {account.username}
            </Link>
            <div className="flex flex-wrap gap-1">
              {account.characters.map((character) => (
                <CharacterChip key={character.guid} character={character} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface MultiBoxCardProps {
  multiBox?: MultiBox;
  loading?: boolean;
}

export default function MultiBoxCard({ multiBox, loading = false }: MultiBoxCardProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  const groups = multiBox?.groups ?? [];
  const totalGroups = multiBox?.totalGroups ?? 0;
  const totalAccounts = groups.reduce((sum, g) => sum + g.accounts.length, 0);
  const totalChars = groups.reduce((sum, g) => sum + groupCharCount(g), 0);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-baseline justify-between mb-4 gap-2 flex-wrap">
        <h2 className="text-sm font-medium">多开检测</h2>
        <span className="text-xs text-muted-foreground">
          {groups.length > 0 ? `${groups.length} 组 · ${totalAccounts} 账号 · ${totalChars} 角色` : '同 IP 多账号同时在线'}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          未发现同 IP 多开
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {groups.map((group) => (
            <GroupRow key={group.ip} group={group} />
          ))}
        </div>
      )}

      <div className="mt-3 text-[10px] text-muted-foreground">
        基于最近登录 IP · 同出口 NAT 可能误判
        {totalGroups > groups.length && ` · 仅显示前 ${groups.length} 组（共 ${totalGroups} 组）`}
      </div>
    </div>
  );
}
