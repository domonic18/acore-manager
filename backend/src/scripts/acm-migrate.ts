import '../config/load-env';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { Client } from 'pg';
import { acmDbConn } from '@/config/env';

// SQL 迁移执行器（ai-invest-assisstant 同款模式）：
// - 迁移文件：docker/database/migrations/YYYYMMDD_NN_description.sql（按文件名顺序执行，git 留痕）
// - 执行记录：acm 库 acm_migrations 表（已应用的文件不重复执行，幂等）
// - acm 库为 PostgreSQL（与游戏 MySQL 隔离），库不存在时先创建
// 用法：npx tsx src/scripts/acm-migrate.ts [up|show]

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'docker', 'database', 'migrations');

async function ensureDatabase(): Promise<void> {
  const admin = new Client({
    host: acmDbConn.host,
    port: acmDbConn.port,
    user: acmDbConn.user,
    password: acmDbConn.pass,
    database: 'postgres',
  });
  try {
    await admin.connect();
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      acmDbConn.database,
    ]);
    if ((exists.rowCount ?? 0) === 0) {
      await admin.query(`CREATE DATABASE "${acmDbConn.database}"`);
      console.log('database created:', acmDbConn.database);
    }
  } finally {
    await admin.end();
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'up';

  await ensureDatabase();

  const conn = new Client({
    host: acmDbConn.host,
    port: acmDbConn.port,
    user: acmDbConn.user,
    password: acmDbConn.pass,
    database: acmDbConn.database,
  });
  await conn.connect();

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS acm_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    const applied = new Set(
      (await conn.query<{ name: string }>('SELECT name FROM acm_migrations')).rows.map(
        (r) => r.name,
      ),
    );
    const pending = files.filter((f) => !applied.has(f));

    if (command === 'show') {
      console.log('applied:', [...applied].sort());
      console.log('pending:', pending);
      return;
    }
    if (command !== 'up') throw new Error(`unknown command: ${command}`);
    if (pending.length === 0) {
      console.log('migrations up to date');
      return;
    }

    for (const file of pending) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await conn.query('BEGIN');
        await conn.query(sql);
        await conn.query('INSERT INTO acm_migrations (name) VALUES ($1)', [file]);
        await conn.query('COMMIT');
        console.log('applied:', file);
      } catch (err) {
        await conn.query('ROLLBACK');
        throw new Error(`migration failed: ${file}`, { cause: err });
      }
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('migration failed:', err.message ?? err);
  process.exit(1);
});
