import { useParams, useNavigate } from 'react-router-dom';
import { useCharacterDetail } from '@/features/character/hooks/useCharacter';
import { useCharacterDetailActions } from '@/features/character/hooks/useCharacterDetailActions';
import { CharacterDetailInfo } from '@/features/character/components/CharacterDetailInfo';
import { CharacterDetailActions } from '@/features/character/components/CharacterDetailActions';
import { MuteDialog } from '@/features/character/components/MuteDialog';
import { CharacterUnmuteConfirmDialog } from '@/features/character/components/CharacterUnmuteConfirmDialog';
import { BanFlowDialogs } from '@/shared/components/BanFlowDialogs';
import { BanHistoryTable } from '@/shared/components/BanHistoryTable';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';

export default function CharacterDetailPage() {
  const { guid } = useParams<{ guid: string }>();
  const navigate = useNavigate();
  const characterGuid = parseInt(guid || '0');
  const { data: character, isLoading } = useCharacterDetail(characterGuid);
  const actions = useCharacterDetailActions(characterGuid);

  if (isLoading) {
    return (
      <div className="text-center py-12 text-muted-foreground">加载中...</div>
    );
  }

  if (!character) {
    return (
      <div className="text-center py-12 text-muted-foreground">角色不存在</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/characters')}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← 返回列表
        </button>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">{character.name}</h1>
        <CharacterDetailActions
          character={character}
          unmutePending={actions.unmutePending}
          unbanPending={actions.unbanPending}
          onOpenBan={actions.banFlow.openForm}
          onOpenUnban={() => actions.setShowUnbanConfirmDialog(true)}
          onOpenMute={() => actions.setShowMuteDialog(true)}
          onOpenUnmute={() => actions.setShowUnmuteConfirmDialog(true)}
        />
      </div>

      <CharacterDetailInfo character={character} />
      <BanHistoryTable bans={character.bans} />

      <BanFlowDialogs
        flow={actions.banFlow}
        title="封禁角色"
        target={{ label: '目标角色', name: character.name, metaLabel: '角色GUID', metaValue: character.guid }}
        onConfirm={actions.handleExecuteBan}
        pending={actions.banPending}
      />
      <MuteDialog
        open={actions.showMuteDialog}
        onClose={() => actions.setShowMuteDialog(false)}
        characterName={character.name}
        characterGuid={character.guid}
        pending={actions.mutePending}
        onSubmit={actions.handleExecuteMute}
      />
      <ConfirmDialog
        open={actions.showUnbanConfirmDialog}
        onClose={() => actions.setShowUnbanConfirmDialog(false)}
        title="确认解禁角色"
        tone="success"
        confirmText="确认解禁"
        pending={actions.unbanPending}
        onConfirm={actions.handleExecuteUnban}
      >
        <div className="text-sm text-muted-foreground">
          确认要解禁角色 <span className="font-medium text-foreground">{character?.name}</span> 吗？
        </div>
      </ConfirmDialog>
      <CharacterUnmuteConfirmDialog
        open={actions.showUnmuteConfirmDialog}
        onClose={() => actions.setShowUnmuteConfirmDialog(false)}
        characterName={character.name}
        pending={actions.unmutePending}
        onConfirm={actions.handleExecuteUnmute}
      />
    </div>
  );
}
