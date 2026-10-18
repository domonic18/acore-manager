import { QUALITY_COLORS } from '@/shared/constants/game';
import { ICON_BASE_URL, ICON_FALLBACK_URL, AOWOW_BASE_URL } from '@/shared/constants/external';
import { useCharacterInventory } from '../hooks/useCharacter';
import type { CharacterInventoryItem } from '../api/character.api';
import { CharacterEquipment } from './CharacterEquipment';

// 角色物品面板：一次拉全量 inventory 行，按 bag/slot 分区渲染
// slot 语义（AC Player.h）：0-18 装备 / 19-22 已装备包位 / 23-38 背包格 / 39-66 银行格 /
// 67-73 银行包位（7 格） / 74-85 回购栏（不展示） / 86-117 钥匙串 / 118-149 货币代币
// bag 列 = 父容器：0 为主容器直放格，>0 为父包物品 GUID（包内物品）

const BACKPACK_START = 23, BACKPACK_END = 38;
const BANK_START = 39, BANK_END = 66;
const EQUIPPED_BAG_START = 19, EQUIPPED_BAG_END = 22;
const BANK_BAG_START = 67, BANK_BAG_END = 73;
const KEYRING_START = 86, KEYRING_END = 117;
const CURRENCY_START = 118, CURRENCY_END = 149;

interface ItemIconCellProps {
  item: CharacterInventoryItem;
  size?: number;
}

function ItemIconCell({ item, size = 40 }: ItemIconCellProps) {
  const qualityColor = QUALITY_COLORS[item.quality] ?? '#fff';
  const iconName = item.icon ?? '';
  const iconUrl = iconName ? `${ICON_BASE_URL}/${iconName.toLowerCase()}.jpg` : null;

  return (
    <a
      href={`${AOWOW_BASE_URL}?item=${item.itemEntry}`}
      target="_blank"
      rel={`item=${item.itemEntry}&domain=4`}
      className="relative block"
      title={item.name}
    >
      <div
        className="flex items-center justify-center rounded border-2 bg-secondary/50"
        style={{ borderColor: qualityColor, width: size, height: size }}
      >
        {iconUrl ? (
          <img
            src={iconUrl}
            alt={item.name}
            className="rounded"
            style={{ width: size - 6, height: size - 6 }}
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
          <span className="text-[9px] text-muted-foreground">{item.itemEntry}</span>
        )}
      </div>
      {item.count > 1 && (
        <span className="absolute bottom-0 right-0 rounded bg-black/70 px-1 text-[10px] font-medium text-white leading-4">
          {item.count}
        </span>
      )}
    </a>
  );
}

function EmptyCell() {
  return (
    <div
      className="flex items-center justify-center rounded border border-dashed border-muted bg-secondary/20 text-muted-foreground/50"
      style={{ width: 40, height: 40 }}
    >
      ·
    </div>
  );
}

interface SlotGridProps {
  items: CharacterInventoryItem[];
  slotStart: number;
  slotEnd: number;
  cols: string;
}

// 固定槽位区（背包 16 格 / 银行 28 格）：按 slot 序号补空格
function SlotGrid({ items, slotStart, slotEnd, cols }: SlotGridProps) {
  const bySlot = new Map(items.filter((i) => i.bag === 0).map((i) => [i.slot, i]));
  const cells: (CharacterInventoryItem | undefined)[] = [];
  for (let s = slotStart; s <= slotEnd; s++) cells.push(bySlot.get(s));

  return (
    <div className={`grid gap-1.5 ${cols}`}>
      {cells.map((item, idx) =>
        item ? <ItemIconCell key={idx} item={item} /> : <EmptyCell key={idx} />,
      )}
    </div>
  );
}

interface BagSectionProps {
  bagItem: CharacterInventoryItem;
  contents: CharacterInventoryItem[];
}

// 单个包：包头（图标/名称/容量）+ 包内物品网格（slot 0..容量-1）
function BagSection({ bagItem, contents }: BagSectionProps) {
  const capacity = bagItem.containerSlots || contents.length || 0;
  const bySlot = new Map(contents.map((i) => [i.slot, i]));
  const cells: (CharacterInventoryItem | undefined)[] = [];
  for (let s = 0; s < capacity; s++) cells.push(bySlot.get(s));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ItemIconCell item={bagItem} size={28} />
        <span style={{ color: QUALITY_COLORS[bagItem.quality] ?? '#fff' }} className="font-medium">
          {bagItem.name}
        </span>
        <span>
          {contents.length}/{capacity} 格
        </span>
      </div>
      {cells.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
          {cells.map((item, idx) =>
            item ? <ItemIconCell key={idx} item={item} /> : <EmptyCell key={idx} />,
          )}
        </div>
      )}
    </div>
  );
}

interface CharacterInventoryPanelProps {
  guid: number;
}

export function CharacterInventoryPanel({ guid }: CharacterInventoryPanelProps) {
  const { data, isLoading } = useCharacterInventory(guid);

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">加载物品数据...</div>;
  }

  const items = data ?? [];
  const direct = items.filter((i) => i.bag === 0);
  const equipped = direct.filter((i) => i.slot <= 18);
  const equippedBags = direct.filter((i) => i.slot >= EQUIPPED_BAG_START && i.slot <= EQUIPPED_BAG_END);
  const bankBags = direct.filter((i) => i.slot >= BANK_BAG_START && i.slot <= BANK_BAG_END);
  const keyringItems = direct.filter((i) => i.slot >= KEYRING_START && i.slot <= KEYRING_END);
  const currencyItems = direct.filter((i) => i.slot >= CURRENCY_START && i.slot <= CURRENCY_END);
  const contentsByBag = new Map<number, CharacterInventoryItem[]>();
  for (const item of items) {
    if (item.bag > 0) {
      const list = contentsByBag.get(item.bag) ?? [];
      list.push(item);
      contentsByBag.set(item.bag, list);
    }
  }

  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        暂无物品数据（角色可能未保存背包状态或刚创建）
      </div>
    );
  }

  const bagCount = contentsByBag.size;
  const baggedCount = items.length - direct.length;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">装备</h3>
        <CharacterEquipment items={equipped} />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">
          背包 <span className="font-normal">{direct.filter((i) => i.slot >= BACKPACK_START && i.slot <= BACKPACK_END).length}/16</span>
        </h3>
        <SlotGrid items={direct} slotStart={BACKPACK_START} slotEnd={BACKPACK_END} cols="grid-cols-4 sm:grid-cols-8" />
        {equippedBags.length > 0 && (
          <div className="space-y-3 pt-1">
            {equippedBags.map((bag) => (
              <BagSection key={bag.itemGuid} bagItem={bag} contents={contentsByBag.get(bag.itemGuid) ?? []} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">
          银行 <span className="font-normal">{direct.filter((i) => i.slot >= BANK_START && i.slot <= BANK_END).length}/28</span>
        </h3>
        <SlotGrid items={direct} slotStart={BANK_START} slotEnd={BANK_END} cols="grid-cols-7" />
        {bankBags.length > 0 && (
          <div className="space-y-3 pt-1">
            {bankBags.map((bag) => (
              <BagSection key={bag.itemGuid} bagItem={bag} contents={contentsByBag.get(bag.itemGuid) ?? []} />
            ))}
          </div>
        )}
      </section>

      {keyringItems.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            钥匙串 <span className="font-normal">{keyringItems.length}</span>
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {keyringItems.map((item) => (
              <ItemIconCell key={item.itemGuid} item={item} />
            ))}
          </div>
        </section>
      )}

      {currencyItems.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            货币代币 <span className="font-normal">{currencyItems.length}</span>
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {currencyItems.map((item) => (
              <ItemIconCell key={item.itemGuid} item={item} />
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        共 {items.length} 件物品（随身/银行直放 {direct.length}，包内 {baggedCount}，背包/银行包 {bagCount} 个）
      </p>
    </div>
  );
}
