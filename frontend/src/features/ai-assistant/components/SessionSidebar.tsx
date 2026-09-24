import { ChatSession } from '../api/ai-assistant.api';
import { MessageSquare, MessageSquarePlus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/shared/lib/utils';

interface SessionSidebarProps {
  sessions: ChatSession[];
  activeId: number | null;
  isLoading: boolean;
  creating: boolean;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
}

// 会话列表：搜索 + 今天/昨天/更早分组 + 悬停删除（二次点击确认），与 ai-invest assistant 侧栏一致
export function SessionSidebar({ sessions, activeId, isLoading, creating, onSelect, onCreate, onDelete }: SessionSidebarProps) {
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return sessions;
    return sessions.filter((s) => (s.title || '新会话').toLowerCase().includes(kw));
  }, [sessions, keyword]);

  const groups = useMemo(() => groupSessions(filtered), [filtered]);

  return (
    <div className="flex h-full flex-col border-r border-border bg-card/50">
      <div className="p-3">
        <button
          onClick={onCreate}
          disabled={creating}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <MessageSquarePlus className="h-4 w-4" />
          新会话
        </button>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索会话"
            className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-2 pb-3">
        {isLoading ? (
          <div className="space-y-1.5 px-1 py-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">暂无会话</p>
        ) : (
          groups.map(
            (g) =>
              g.items.length > 0 && (
                <div key={g.label}>
                  <div className="mb-1 ml-2 text-xs font-medium text-muted-foreground">{g.label}</div>
                  <div className="space-y-0.5">
                    {g.items.map((s) => (
                      <SessionItem key={s.id} session={s} isActive={s.id === activeId} onClick={() => onSelect(s.id)} onDelete={() => onDelete(s.id)} />
                    ))}
                  </div>
                </div>
              ),
          )
        )}
      </div>
    </div>
  );
}

function groupSessions(sessions: ChatSession[]): { label: string; items: ChatSession[] }[] {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 86_400_000;
  const groups: { label: string; items: ChatSession[] }[] = [
    { label: '今天', items: [] },
    { label: '昨天', items: [] },
    { label: '更早', items: [] },
  ];
  for (const s of sessions) {
    const t = new Date(s.lastActiveAt).getTime();
    if (Number.isFinite(t) && t >= startToday) groups[0].items.push(s);
    else if (Number.isFinite(t) && t >= startYesterday) groups[1].items.push(s);
    else groups[2].items.push(s);
  }
  return groups;
}

function SessionItem({ session, isActive, onClick, onDelete }: { session: ChatSession; isActive: boolean; onClick: () => void; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const time = new Date(session.lastActiveAt);
  const timeText = Number.isFinite(time.getTime())
    ? `${String(time.getMonth() + 1).padStart(2, '0')}-${String(time.getDate()).padStart(2, '0')} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
    : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        'group flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent',
      )}
    >
      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm">{session.title?.trim() || '新会话'}</span>
        {timeText && <span className="text-xs text-muted-foreground">{timeText}</span>}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirming) {
            setConfirming(false);
            onDelete();
          } else {
            setConfirming(true);
            setTimeout(() => setConfirming(false), 3000);
          }
        }}
        className={cn(
          'shrink-0 rounded p-1 text-muted-foreground transition-opacity hover:bg-accent hover:text-destructive',
          confirming ? 'text-destructive opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
        aria-label={confirming ? '确认删除' : '删除会话'}
        title={confirming ? '再次点击确认删除' : '删除'}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
