import { useNavigate } from 'react-router-dom';
import { AI_QUICK_ANALYZE_EVENT, type QuickAnalyzePayload } from '@/shared/lib/ai-quick-analyze';
import type { CharacterDetail } from '@/features/character/api/character.api';

interface CharacterDetailActionsProps {
  character: CharacterDetail;
  unmutePending: boolean;
  unbanPending: boolean;
  onOpenBan: () => void;
  onOpenUnban: () => void;
  onOpenMute: () => void;
  onOpenUnmute: () => void;
}

export function CharacterDetailActions({
  character,
  unmutePending,
  unbanPending,
  onOpenBan,
  onOpenUnban,
  onOpenMute,
  onOpenUnmute,
}: CharacterDetailActionsProps) {
  const navigate = useNavigate();
  const activeBans = character.bans?.filter((b) => b.active) || [];

  return (
    <div className="flex gap-2">
      <button
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent(AI_QUICK_ANALYZE_EVENT, {
              detail: {
                subjectType: 'character',
                name: character.name,
                guid: character.guid,
                accountName: character.accountUsername,
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
          navigate('/ai-diagnosis/targeted', { state: { subjectType: 'character', subjectName: character.name } })
        }
        className="px-4 py-2 rounded-md border border-blue-600 text-blue-400 text-sm font-medium hover:bg-blue-600/10"
      >
        AI 定向分析
      </button>
      <button
        onClick={onOpenMute}
        className="px-4 py-2 rounded-md bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
      >
        禁言聊天
      </button>
      <button
        onClick={onOpenUnmute}
        disabled={unmutePending}
        className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
      >
        {unmutePending ? '处理中...' : '解禁聊天'}
      </button>
      {activeBans.length > 0 ? (
        <button
          onClick={onOpenUnban}
          disabled={unbanPending}
          className="px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {unbanPending ? '处理中...' : '解禁角色'}
        </button>
      ) : (
        <button
          onClick={onOpenBan}
          className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700"
        >
          封禁角色
        </button>
      )}
    </div>
  );
}
