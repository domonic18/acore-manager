import { Pool } from 'pg';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

// 跨进程会话持久化：PostgresSaver（acm 自有 PG 库，无 Redis 模块依赖——
// RedisSaver 硬依赖 RedisJSON/RediSearch，本地 redis:7-alpine 与生产腾讯云 Redis 均不满足，见 M0-Spike结论.md）。
// 注：PG checkpointer 无 TTL 语义，checkpoint 持久保存；会话清理改用 deleteThread 定期任务（M2 会话管理实现）。
let pool: Pool | undefined;

export async function createCheckpointer(): Promise<PostgresSaver> {
  const url = process.env.ACM_DB_URL;
  if (!url) throw new Error('missing ACM_DB_URL (backend/.env.local or root .env)');
  pool = new Pool({ connectionString: url, max: 2 });
  const saver = new PostgresSaver(pool);
  // 幂等：仅首次创建 checkpoint 相关表与迁移记录
  await saver.setup();
  return saver;
}

export async function closeCheckpointer(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
