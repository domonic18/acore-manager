import { ChatUiMessage } from '../hooks/useChatStream';
import { AlertCircle, Bot, ChevronDown, Loader2, Wrench } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/shared/lib/utils';
import { Markdown } from '@/shared/components/Markdown';
import { CopyButton } from '@/shared/components/CopyButton';

const SUGGESTIONS = [
  '最近哪些角色被举报最多？',
  '昨天有哪些角色触发了 Speed-Hack 举报？',
  '帮我分析一次最近的反作弊日志',
  '查一下最近的大额金钱流水',
];

const NOTES = ['仅做只读查询与研判分析，不执行任何写操作', '误报信号仅供参考，不能作为封号的唯一依据'];

interface MessageListProps {
  messages: ChatUiMessage[];
  loading: boolean;
  onSuggest: (text: string) => void;
}

export function MessageList({ messages, loading, onSuggest }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const content = messages.map((m) => m.content).join('|');

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [content, messages.length, loading]);

  if (loading) return <HistorySkeleton />;

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
      {messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Bot className="h-7 w-7 text-primary" />
          </div>
          <h3 className="mb-1 text-base font-medium">AI 助手</h3>
          <p className="mb-4 max-w-sm text-sm text-muted-foreground">
            支持角色档案、反作弊举报、资金流水、日志解析等只读研判问答，可帮你分析可疑玩家与误报。
          </p>
          <ul className="mb-5 max-w-sm space-y-0.5 text-left text-xs text-muted-foreground/80">
            {NOTES.map((n) => (
              <li key={n}>· {n}</li>
            ))}
          </ul>
          <div className="w-full max-w-sm text-left">
            <div className="mb-2 text-xs text-muted-foreground">试试这样问</div>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onSuggest(q)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground/80 transition-colors hover:bg-accent"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={cn('flex gap-3', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              {m.role === 'assistant' && (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className={cn('min-w-0 max-w-[85%] md:max-w-[75%]')}>
                <div
                  className={cn(
                    'rounded-2xl px-3.5 py-2.5 text-sm break-words',
                    m.role === 'user'
                      ? 'whitespace-pre-wrap rounded-br-sm bg-primary text-primary-foreground'
                      : 'rounded-tl-sm border border-border bg-card shadow-sm',
                  )}
                >
                  {m.tools.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {m.tools.map((t, i) => (
                        <ToolRow key={`${t.name}-${i}`} tool={t} />
                      ))}
                    </div>
                  )}
                  {m.role === 'assistant' && m.content ? <Markdown content={m.content} /> : m.content}
                  {m.streaming && <span className="ml-0.5 inline-block h-4 w-[7px] translate-y-[3px] animate-pulse rounded-sm bg-primary/80" />}
                  {m.error && (
                    <div className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{m.error}</span>
                    </div>
                  )}
                </div>
                {m.role === 'assistant' && !m.streaming && m.content && <CopyButton text={m.content} className="mt-1" />}
              </div>
            </div>
          ))}
          {messages[messages.length - 1]?.streaming && messages[messages.length - 1]?.content === '' && messages[messages.length - 1].tools.length === 0 && (
            <div className="flex items-center gap-1.5 pl-10" aria-label="助手正在处理">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: `${i * 160}ms` }} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolRow({ tool }: { tool: ChatUiMessage['tools'][number] }) {
  const running = tool.status === 'running';
  return (
    <details className="overflow-hidden rounded-lg border border-border/60 bg-muted/40">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-xs [&::-webkit-details-marker]:hidden">
        {running ? (
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
        ) : tool.error ? (
          <AlertCircle className="h-3 w-3 text-destructive" />
        ) : (
          <Wrench className="h-3 w-3 text-primary" />
        )}
        <span className="font-mono text-foreground/80">{tool.name}</span>
        <span className="ml-auto flex items-center gap-1 text-muted-foreground">
          {running ? (
            '运行中…'
          ) : (
            <>
              {tool.error ? (
                <span className="text-destructive">失败</span>
              ) : (
                <>
                  {tool.rowCount != null ? `${tool.rowCount} 行` : '已完成'}
                  {tool.durationMs != null ? ` · ${tool.durationMs}ms` : ''}
                </>
              )}
              <ChevronDown className="h-3 w-3" />
            </>
          )}
        </span>
      </summary>
      {tool.error && !running && (
        <div className="border-t border-destructive/20 px-2.5 py-1.5 text-xs text-destructive">{tool.error}</div>
      )}
      {tool.args != null && !running && (
        <pre className="max-h-40 overflow-auto border-t border-border/40 px-2.5 py-1.5 text-xs text-muted-foreground">{JSON.stringify(tool.args, null, 2)}</pre>
      )}
    </details>
  );
}

function HistorySkeleton() {
  return (
    <div className="px-4 py-4" aria-busy="true" aria-label="正在加载会话记录">
      {[0, 1].map((round) => (
        <div key={round} className="mb-5">
          <div className="mb-4 flex justify-end">
            <div className="h-9 animate-pulse rounded-2xl rounded-br-sm bg-muted" style={{ width: round === 0 ? 160 : 120 }} />
          </div>
          <div className="flex gap-3">
            <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="space-y-2">
              {['w-36', 'w-64', 'w-48'].map((w, i) => (
                <div key={i} className={cn('h-4 animate-pulse rounded bg-muted/70', w)} style={{ animationDelay: `${round * 120 + i * 80}ms` }} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
