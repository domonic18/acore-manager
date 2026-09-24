import { authDataSource, charactersDataSource, worldDataSource } from '@/config/database';

// 游戏三库只读查询护栏（需求 3.5）：
// - 仅 SELECT（硬校验，拒绝任何写关键字开头/含分号追加的语句）
// - 行数上限 MAX_ROWS（超出截断并标记 truncated）
// 结果统一为 { rows, truncated }，工具层再组装为业务输出。

export type GameDb = 'auth' | 'characters' | 'world';

const MAX_ROWS = 50;

function dataSourceOf(db: GameDb) {
  switch (db) {
    case 'auth':
      return authDataSource;
    case 'characters':
      return charactersDataSource;
    case 'world':
      return worldDataSource;
  }
}

export async function runReadOnly(
  db: GameDb,
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: Record<string, unknown>[]; truncated: boolean }> {
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  if (!/^SELECT\s/i.test(trimmed) || /;\s*\S/i.test(sql)) {
    throw new Error('rejected: only single SELECT statements are allowed');
  }
  const ds = dataSourceOf(db);
  if (!ds.isInitialized) throw new Error(`datasource ${db} not initialized`);
  let rows = (await ds.query(trimmed, params)) as Record<string, unknown>[];
  if (!Array.isArray(rows)) rows = [rows as unknown as Record<string, unknown>];
  if (rows.length > MAX_ROWS) rows = rows.slice(0, MAX_ROWS);
  return { rows, truncated: rows.length >= MAX_ROWS };
}
