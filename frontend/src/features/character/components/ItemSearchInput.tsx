import { useEffect, useRef, useState } from 'react';
import { characterApi, type ItemSearchResult } from '../api/character.api';
import { QUALITY_COLORS } from '@/shared/constants/game';
import { ICON_BASE_URL, ICON_FALLBACK_URL } from '@/shared/constants/external';

interface ItemSearchInputProps {
  onSelect: (item: ItemSearchResult) => void;
  placeholder?: string;
}

// 物品 typeahead（管理员邮件附件）：300ms 防抖，entry 前缀 + 中文名模糊；
// 下拉项带图标/品质色/说明，防误发。seq ref 丢弃乱序返回的旧请求
export function ItemSearchInput({ onSelect, placeholder }: ItemSearchInputProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ItemSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setOpen(false);
      return;
    }
    const seq = ++seqRef.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const items = await characterApi.searchItems(q, 10);
        if (seq !== seqRef.current) return;
        setResults(items);
        setOpen(true);
      } catch {
        if (seq !== seqRef.current) return;
        setResults([]);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const pick = (item: ItemSearchResult) => {
    onSelect(item);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder ?? '输入物品 ID 或中文名搜索'}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
          {loading && <div className="px-3 py-2 text-xs text-muted-foreground">搜索中...</div>}
          {!loading && results.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">无匹配物品</div>}
          {results.map((item) => {
            const color = QUALITY_COLORS[item.quality] ?? '#fff';
            const iconName = item.icon ?? '';
            const iconUrl = iconName ? `${ICON_BASE_URL}/${iconName.toLowerCase()}.jpg` : null;
            return (
              <button
                key={item.entry}
                type="button"
                // mousedown 抢在 input blur 外部关闭前完成选中
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(item);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              >
                {iconUrl ? (
                  <img
                    src={iconUrl}
                    alt=""
                    className="h-7 w-7 shrink-0 rounded border border-border object-cover"
                    loading="lazy"
                    onError={(e) => {
                      const t = e.target as HTMLImageElement;
                      if (!t.src.includes(ICON_FALLBACK_URL)) {
                        t.src = `${ICON_FALLBACK_URL}/${iconName.toLowerCase()}.jpg`;
                      } else {
                        t.style.display = 'none';
                      }
                    }}
                  />
                ) : (
                  <div className="h-7 w-7 shrink-0 rounded border border-border bg-secondary/50" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium" style={{ color }}>
                      {item.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">ID {item.entry}</span>
                  </div>
                  {item.description && <div className="truncate text-xs text-muted-foreground">{item.description}</div>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
