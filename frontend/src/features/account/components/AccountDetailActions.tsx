import { useNavigate } from 'react-router-dom';
import { AI_QUICK_ANALYZE_EVENT, type QuickAnalyzePayload } from '@/features/ai-assistant/components/AiAssistantDock';
import type { AccountDetail } from '@/features/account/api/account.api';

interface AccountDetailActionsProps {
  account: AccountDetail;
  unbanPending: boolean;
  onOpenBan: () => void;
  onOpenUnban: () => void;
  onOpenPassword: () => void;
}

export function AccountDetailActions({ account, unbanPending, onOpenBan, onOpenUnban, onOpenPassword }: AccountDetailActionsProps) {
  const navigate = useNavigate();
  const activeBans = account.bans?.filter((b) => b.active) || [];

  return (
    <div className="flex gap-2">
      <button
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent(AI_QUICK_ANALYZE_EVENT, {
              detail: {
                subjectType: 'account',
                name: account.username,
                accountName: account.username,
                ...(activeBans.length > 0
                  ? {
                      ban: {
                        date: new Date(activeBans[0].banDate).toLocaleString('zh-CN'),
                        reason: activeBans[0].banReason,
                        bannedBy: activeBans[0].bannedBy,
                      },
                    }
                  : {}),
              } satisfies QuickAnalyzePayload,
            }),
          )
        }
        className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
      >
        快速分析
      </button>
      <button
        onClick={() =>
          navigate('/ai-diagnosis/targeted', { state: { subjectType: 'account', subjectName: account.username } })
        }
        className="px-4 py-2 rounded-md border border-blue-600 text-blue-400 text-sm font-medium hover:bg-blue-600/10"
      >
        AI 定向分析
      </button>
      <button
        onClick={onOpenPassword}
        className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
      >
        更改密码
      </button>
      {activeBans.length > 0 ? (
        <button
          onClick={onOpenUnban}
          disabled={unbanPending}
          className="px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {unbanPending ? '处理中...' : '解禁账号'}
        </button>
      ) : (
        <button
          onClick={onOpenBan}
          className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700"
        >
          封禁账号
        </button>
      )}
    </div>
  );
}
