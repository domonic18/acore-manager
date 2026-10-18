import { QUALITY_COLORS } from '@/shared/constants/game';
import { ICON_BASE_URL, ICON_FALLBACK_URL, AOWOW_BASE_URL } from '@/shared/constants/external';
import type { CharacterInventoryItem } from '../api/character.api';

const slotNames: Record<number, string> = {
  0: '头部', 1: '颈部', 2: '肩部', 3: '衬衫', 4: '胸甲',
  5: '腰带', 6: '腿部', 7: '靴子', 8: '护腕', 9: '手套',
  10: '戒指', 11: '戒指', 12: '饰品', 13: '饰品',
  14: '背部', 15: '主手', 16: '副手', 17: '远程', 18: '战袍',
};

interface ItemSlotProps {
  slot: number;
  item?: CharacterInventoryItem;
  reverse?: boolean;
}

export function ItemSlot({ slot, item, reverse }: ItemSlotProps) {
  const qualityColor = item ? (QUALITY_COLORS[item.quality] ?? '#fff') : undefined;
  const iconName = item?.icon ?? '';
  const iconUrl = iconName ? `${ICON_BASE_URL}/${iconName.toLowerCase()}.jpg` : null;
  const aowowUrl = item ? `${AOWOW_BASE_URL}?item=${item.itemEntry}` : undefined;
  const aowowRel = item ? `item=${item.itemEntry}&domain=4` : undefined;

  const content = (
    <>
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded border-2 bg-secondary/50 relative ${item ? '' : 'border-muted'}`}
        style={item ? { borderColor: qualityColor } : undefined}
        title={item ? `${slotNames[slot]} - ${item.name}` : slotNames[slot]}
      >
        {iconUrl ? (
          <img
            src={iconUrl}
            alt={item!.name}
            className="h-10 w-10 rounded"
            loading="lazy"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (!target.src.includes(ICON_FALLBACK_URL)) {
                target.src = `${ICON_FALLBACK_URL}/${iconName.toLowerCase()}.jpg`;
              } else {
                target.style.display = 'none';
              }
            }}
          />
        ) : (
          <span className="text-[10px] text-muted-foreground">{slotNames[slot]}</span>
        )}
        {item && item.count > 1 && (
          <span className="absolute bottom-0 right-0 rounded bg-black/70 px-1 text-[10px] font-medium text-white">
            {item.count}
          </span>
        )}
      </div>
      <div className={`min-w-0 flex-1 ${reverse ? 'text-right' : 'text-left'}`}>
        {item ? (
          <>
            <div
              className="truncate text-sm font-medium"
              style={{ color: qualityColor }}
            >
              {item.name}
              {item.count > 1 && <span className="ml-1 text-muted-foreground">×{item.count}</span>}
            </div>
            <div className="text-xs text-muted-foreground">
              ID {item.itemEntry}
            </div>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </div>
    </>
  );

  if (aowowUrl) {
    return (
      <a
        href={aowowUrl}
        target="_blank"
        rel={aowowRel}
        className={`flex items-center gap-3 ${reverse ? 'flex-row-reverse' : ''}`}
        title={`${slotNames[slot]}: ${item!.name}`}
      >
        {content}
      </a>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${reverse ? 'flex-row-reverse' : ''}`}>
      {content}
    </div>
  );
}
