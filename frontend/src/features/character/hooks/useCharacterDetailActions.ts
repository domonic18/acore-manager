import { useState } from 'react';
import {
  useUnbanCharacter,
  useBanCharacter,
  useMuteCharacter,
  useUnmuteCharacter,
} from '@/features/character/hooks/useCharacter';
import { characterApi } from '@/features/character/api/character.api';
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
  const [showHonorDialog, setShowHonorDialog] = useState(false);
  const [showKickDialog, setShowKickDialog] = useState(false);
  const [kickPending, setKickPending] = useState(false);
  const [showMessageDialog, setShowMessageDialog] = useState(false);
  const [messagePending, setMessagePending] = useState(false);

  const handleExecuteKick = (reason?: string) => {
    setKickPending(true);
    return characterApi.kick(characterGuid, reason ? { reason } : undefined).finally(() => setKickPending(false));
  };

  const handleExecuteMessage = (message: string) => {
    setMessagePending(true);
    return characterApi.sendMessage(characterGuid, { message }).finally(() => setMessagePending(false));
  };

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
    showHonorDialog,
    setShowHonorDialog,
    showKickDialog,
    setShowKickDialog,
    kickPending,
    handleExecuteKick,
    showMessageDialog,
    setShowMessageDialog,
    messagePending,
    handleExecuteMessage,
    handleExecuteBan,
    handleExecuteMute,
    handleExecuteUnban,
    handleExecuteUnmute,
  };
}
