import { cacheService } from './cache.service';
import { logger } from '@/middleware/request-logger';
import { itemRepository } from '@/repositories/item.repository';
import { ITEM_DISPLAY_INFO } from '@/generated/itemDisplayInfo';

// 物品搜索（管理员邮件附件 typeahead）：模板为静态数据，Redis 缓存 60s 挡连击输入
export interface ItemSearchItem {
  entry: number;
  name: string;
  description: string;
  displayId: number;
  quality: number;
  stackable: number;
  maxCount: number;
  icon: string | null;
}

export class ItemService {
  async searchItems(query: string, limit = 10): Promise<ItemSearchItem[]> {
    const q = query.trim();
    if (!q || q.length > 64) return [];

    const cacheKey = `items:search:${q}:${limit}`;
    const cached = await cacheService.get<ItemSearchItem[]>(cacheKey);
    if (cached) return cached;

    const rows = await itemRepository.searchItems(q, limit);
    const result: ItemSearchItem[] = rows.map((row: any) => ({
      entry: row.entry,
      name: row.name,
      description: row.description || '',
      displayId: row.displayId,
      quality: row.quality,
      stackable: row.stackable,
      maxCount: row.maxCount,
      icon: ITEM_DISPLAY_INFO[row.displayId] ?? null,
    }));

    await cacheService.set(cacheKey, result, 60).catch((err: unknown) =>
      logger.warn(`[item] search cache set failed: ${(err as Error).message}`),
    );
    return result;
  }

  async getItemsByEntries(entries: number[]): Promise<Map<number, { name: string; stackable: number; maxCount: number }>> {
    return itemRepository.getItemsByEntries(entries);
  }
}

export const itemService = new ItemService();
