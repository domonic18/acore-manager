import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useNameSuggest } from '../hooks/useGmTool';

// 邮件目标输入（GM 工具）：chips + 角色名前缀联想，防手滑输错名字；
// Enter 收录原始输入（允许目标不存在时走失败隔离反馈），Backspace 删除末位，点 × 移除。

interface TargetInputProps {
  value: string[];
  onChange: (names: string[]) => void;
  placeholder?: string;
}

export function TargetInput({ value, onChange, placeholder }: TargetInputProps) {
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: suggestions } = useNameSuggest(text.trim());

  const candidates = (suggestions ?? []).filter((n) => !value.some((v) => v.toLowerCase() === n.toLowerCase()));

  // 输入停顿后才发起联想，避免逐键打接口
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const showDropdown = focused && debounced !== '' && candidates.length > 0;

  const add = (name: string): void => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!value.some((v) => v.toLowerCase() === trimmed.toLowerCase())) onChange([...value, trimmed]);
    setText('');
  };

  const removeAt = (i: number): void => {
    onChange(value.filter((_, idx) => idx !== i));
  };

  return (
    <div className="relative">
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-sm focus-within:ring-1 focus-within:ring-primary"
      >
        {value.map((name, i) => (
          <span key={name} className="flex items-center gap-1 rounded bg-accent px-2 py-0.5 text-xs font-medium">
            {name}
            <button onClick={(e) => { e.stopPropagation(); removeAt(i); }} aria-label={`移除 ${name}`} className="text-muted-foreground hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(candidates[0] && text.trim() !== '' && candidates[0].toLowerCase().startsWith(text.trim().toLowerCase()) ? candidates[0] : text);
            } else if (e.key === 'Backspace' && text === '' && value.length > 0) {
              removeAt(value.length - 1);
            }
          }}
          placeholder={value.length === 0 ? placeholder : ''}
          className="min-w-[120px] flex-1 bg-transparent py-0.5 text-sm outline-none"
        />
      </div>
      {showDropdown && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-lg">
          {candidates.map((n) => (
            <li key={n}>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(n);
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
              >
                {n}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
