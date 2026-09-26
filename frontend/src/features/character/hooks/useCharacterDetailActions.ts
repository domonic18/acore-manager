import { useState } from 'react';
import {
  useUnbanCharacter,
  useBanCharacter,
  useMuteCharacter,
  useUnmuteCharacter,
} from '@/features/character/hooks/useCharacter';
import { useBanFlow } from '@/shared/hooks/useBanFlow';

// 角色详情页操作编排：封禁流程状态机 + 禁言/解禁聊天/解封对话框开关与 mutation 回调
export function useCharacterDetailActions(characterGuid: number) {
  const unbanMutation = useUnbanCharacter();
  const banMutation = useBanCharacter();
  const muteMutation = useMuteCharacter();
  const unmuteMutation = useUnmuteCharacter();

  const banFlow = useBanFlow();
  const [showMuteDialog, setShowMuteDialog] = useState(false);
  const [showUnbanConfirmDialog, setShowUnbanConfirmDialog] = useState(false);
  const [showUnmuteConfirmDialog, setShowUnmuteConfirmDialog] = useState(false);

  const handleExecuteBan = () => {
    banMutation.mutate(
      { guid: characterGuid, data: { duration: banFlow.duration, reason: banFlow.finalReason } },
      { onSuccess: () => banFlow.closeAll() },
    );
  };

  const handleExecuteMute = (data: { duration: string; reason: string }) => {
    muteMutation.mutate(
      { guid: characterGuid, data },
      { onSuccess: () => setShowMuteDialog(false) },
    );
  };

  const handleExecuteUnban = () => {
    unbanMutation.mutate(characterGuid, {
      onSuccess: () => setShowUnbanConfirmDialog(false),
    });
  };

  const handleExecuteUnmute = () => {
    unmuteMutation.mutate(characterGuid, {
      onSuccess: () => setShowUnmuteConfirmDialog(false),
    });
  };

  return {
    banFlow,
    banPending: banMutation.isPending,
    mutePending: muteMutation.isPending,
    unmutePending: unmuteMutation.isPending,
    unbanPending: unbanMutation.isPending,
    showMuteDialog,
    setShowMuteDialog,
    showUnbanConfirmDialog,
    setShowUnbanConfirmDialog,
    showUnmuteConfirmDialog,
    setShowUnmuteConfirmDialog,
    handleExecuteBan,
    handleExecuteMute,
    handleExecuteUnban,
    handleExecuteUnmute,
  };
}
