import { useState } from 'react';
import { useUnbanAccount, useBanAccount, useChangePassword } from '@/features/account/hooks/useAccount';
import { useBanFlow } from '@/shared/hooks/useBanFlow';
import { toast } from '@/shared/utils/toast.util';

// 账号详情页操作编排：封禁流程状态机 + 改密/解封对话框开关 + 带 toast 的 mutation 回调
export function useAccountDetailActions(accountId: number) {
  const unbanMutation = useUnbanAccount();
  const banMutation = useBanAccount();
  const changePasswordMutation = useChangePassword();

  const banFlow = useBanFlow();
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showUnbanConfirmDialog, setShowUnbanConfirmDialog] = useState(false);

  const handleExecuteBan = () => {
    banMutation.mutate(
      { id: accountId, data: { duration: banFlow.duration, reason: banFlow.finalReason } },
      {
        onSuccess: () => {
          banFlow.closeAll();
          toast.success('封禁操作成功');
        },
        onError: (error: Error) => {
          toast.error(error.message || '封禁失败，请检查 SOAP 服务器连接');
        },
      },
    );
  };

  const handleExecuteUnban = () => {
    unbanMutation.mutate(accountId, {
      onSuccess: () => {
        setShowUnbanConfirmDialog(false);
        toast.success('解禁成功');
      },
      onError: (error: Error) => {
        toast.error(error.message || '解禁失败，请检查 SOAP 服务器连接');
      },
    });
  };

  const handleChangePassword = (password: string) => {
    changePasswordMutation.mutate(
      { id: accountId, password },
      {
        onSuccess: () => {
          setShowPasswordDialog(false);
          toast.success('密码修改成功');
        },
        onError: (error: Error) => {
          toast.error(error.message || '密码修改失败，请检查 SOAP 服务器连接');
        },
      },
    );
  };

  return {
    banFlow,
    unbanPending: unbanMutation.isPending,
    banPending: banMutation.isPending,
    changePasswordPending: changePasswordMutation.isPending,
    showPasswordDialog,
    setShowPasswordDialog,
    showUnbanConfirmDialog,
    setShowUnbanConfirmDialog,
    handleExecuteBan,
    handleExecuteUnban,
    handleChangePassword,
  };
}
