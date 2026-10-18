import { charactersDataSource } from '@/config/database';

class ItemRepository {
  // 物品联想搜索（管理员邮件附件选择）：纯数字按 entry 前缀优先，同时 zhCN/英文名模糊；
  // stackable 供发送前 12 格拆堆校验，Description 为 tooltip 说明
  async searchItems(query: string, limit = 10): Promise<any[]> {
    return charactersDataSource.query(
      `SELECT
        it.entry,
        COALESCE(loc.Name, it.name) AS name,
        COALESCE(loc.Description, '') AS description,
        it.displayid AS displayId,
        it.Quality AS quality,
        it.stackable AS stackable,
        it.MaxCount AS maxCount,
        (it.entry LIKE ?) AS entryMatch
      FROM acore_world.item_template it
      LEFT JOIN acore_world.item_template_locale loc ON it.entry = loc.ID AND loc.locale = 'zhCN'
      WHERE it.entry LIKE ? OR it.name LIKE ? OR loc.Name LIKE ?
      ORDER BY entryMatch DESC, it.entry ASC
      LIMIT ?`,
      [`${query}%`, `${query}%`, `%${query}%`, `%${query}%`, limit],
    );
  }

  // 发送前校验用：按 entry 批量取 stackable/MaxCount 与名称
  async getItemsByEntries(entries: number[]): Promise<Map<number, { name: string; stackable: number; maxCount: number }>> {
    const map = new Map<number, { name: string; stackable: number; maxCount: number }>();
    if (entries.length === 0) return map;
    const placeholders = entries.map(() => '?').join(',');
    const rows: any[] = await charactersDataSource.query(
      `SELECT it.entry, COALESCE(loc.Name, it.name) AS name, it.stackable, it.MaxCount AS maxCount
       FROM acore_world.item_template it
       LEFT JOIN acore_world.item_template_locale loc ON it.entry = loc.ID AND loc.locale = 'zhCN'
       WHERE it.entry IN (${placeholders})`,
      entries,
    );
    for (const row of rows) {
      map.set(row.entry, { name: row.name, stackable: row.stackable, maxCount: row.maxCount });
    }
    return map;
  }
}

export const itemRepository = new ItemRepository();
