import { KeyboardEvent, useRef, useState } from 'react';
import { SendHorizonal, Square } from 'lucide-react';

interface ComposerProps {
  disabled: boolean;
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function Composer({ disabled, streaming, onSend, onStop }: ComposerProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const value = text.trim();
    if (!value || disabled) return;
    onSend(value);
    setText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-border p-3">
      <div className="flex items-end gap-2 rounded-xl border border-border bg-card p-2 shadow-sm transition-colors focus-within:border-primary/60">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          autoFocus
          placeholder="问我任何玩家研判问题，如「最近哪些角色被举报最多」"
          disabled={disabled}
          className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm focus:outline-none disabled:opacity-50"
        />
        {streaming ? (
          <button
            onClick={onStop}
            className="shrink-0 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/20"
          >
            <Square className="mr-1 inline h-3 w-3" />
            停止
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={disabled || !text.trim()}
            className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            <SendHorizonal className="mr-1 inline h-3.5 w-3.5" />
            发送
          </button>
        )}
      </div>
    </div>
  );
}
