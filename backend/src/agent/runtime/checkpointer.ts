import { Pool } from 'pg';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { acmDbConn } from '@/config/env';

// PostgresSaver 单例（acm 自有 PG 库）。T0.3 结论：RedisSaver 硬依赖 RedisJSON/RediSearch
// 模块而弃用；PG checkpoint 无 TTL，会话清理由 chat-session.service 按 deleteThread 执行。
let pool: Pool | null = null;
let saverPromise: Promise<PostgresSaver> | null = null;

export function getCheckpointer(): Promise<PostgresSaver> {
  if (!saverPromise) {
    saverPromise = (async () => {
      pool = new Pool({
        host: acmDbConn.host,
        port: acmDbConn.port,
        user: acmDbConn.user,
        password: acmDbConn.pass,
        database: acmDbConn.database,
        max: 2,
      });
      const saver = new PostgresSaver(pool);
      // 幂等建表；memo 化避免并发初始化竞争（M0 遗留项）
      await saver.setup();
      return saver;
    })();
    saverPromise.catch(() => {
      // 失败后允许下次重试
      saverPromise = null;
    });
  }
  return saverPromise;
}

export async function deleteThread(threadId: string): Promise<void> {
  const saver = await getCheckpointer();
  await saver.deleteThread(threadId);
}

export async function closeCheckpointer(): Promise<void> {
  saverPromise = null;
  if (pool) {
    await pool.end();
    pool = null;
  }
}
