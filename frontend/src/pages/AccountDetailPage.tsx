import { useParams, useNavigate } from 'react-router-dom';
import { useAccountDetail, useAccountCharacters, useAccountLoginHistory } from '@/features/account/hooks/useAccount';
import { useAccountDetailActions } from '@/features/account/hooks/useAccountDetailActions';
import { AccountDetailInfo } from '@/features/account/components/AccountDetailInfo';
import { AccountCharactersTable } from '@/features/account/components/AccountCharactersTable';
import { AccountLoginHistoryTable } from '@/features/account/components/AccountLoginHistoryTable';
import { ChangePasswordDialog } from '@/features/account/components/ChangePasswordDialog';
import { AccountUnbanDialog } from '@/features/account/components/AccountUnbanDialog';
import { AccountDetailActions } from '@/features/account/components/AccountDetailActions';
import { BanFlowDialogs } from '@/shared/components/BanFlowDialogs';
import { BanHistoryTable } from '@/shared/components/BanHistoryTable';

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const accountId = parseInt(id || '0');
  const { data: account, isLoading } = useAccountDetail(accountId);
  const { data: characters, isLoading: charsLoading } = useAccountCharacters(accountId);
  const { data: loginHistory, isLoading: historyLoading } = useAccountLoginHistory(accountId);
  const actions = useAccountDetailActions(accountId);

  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">加载中...</div>
    );
  }

  if (!account) {
    return (
      <div className="text-center py-12 text-muted-foreground">账号不存在</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/accounts')}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← 返回列表
        </button>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">{account.username}</h1>
        <AccountDetailActions
          account={account}
          unbanPending={actions.unbanPending}
          onOpenBan={actions.banFlow.openForm}
          onOpenUnban={() => actions.setShowUnbanConfirmDialog(true)}
          onOpenPassword={() => actions.setShowPasswordDialog(true)}
        />
      </div>

      <AccountDetailInfo account={account} />
      <AccountCharactersTable
        characters={characters}
        loading={charsLoading}
        onRowClick={(char) => navigate(`/characters/${char.guid}`)}
      />
      <AccountLoginHistoryTable history={loginHistory} loading={historyLoading} />
      <BanHistoryTable bans={account.bans} />

      <BanFlowDialogs
        flow={actions.banFlow}
        title="封禁账号"
        target={{ label: '目标账号', name: account.username, metaLabel: '账号ID', metaValue: account.id }}
        onConfirm={actions.handleExecuteBan}
        pending={actions.banPending}
      />
      <ChangePasswordDialog
        open={actions.showPasswordDialog}
        onClose={() => actions.setShowPasswordDialog(false)}
        username={account.username}
        pending={actions.changePasswordPending}
        onSubmit={actions.handleChangePassword}
      />
      <AccountUnbanDialog
        open={actions.showUnbanConfirmDialog}
        onClose={() => actions.setShowUnbanConfirmDialog(false)}
        username={account.username}
        pending={actions.unbanPending}
        onConfirm={actions.handleExecuteUnban}
      />
    </div>
  );
}
