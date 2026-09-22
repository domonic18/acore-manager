import './env';
import { createConnection, RowDataPacket } from 'mysql2/promise';
import { Client } from 'pg';
import { acmDbConn, dbConn, env } from '../../src/config/env';

// 一次性迁移：MySQL acm.ai_model_config → PostgreSQL acm.ai_model_config
// api_key_encrypted 为 AES-GCM 密文（密钥未变），直接搬运即可解密
// 用法：npx tsx poc/agent/migrate-mysql-to-pg.ts

interface MysqlRow extends RowDataPacket {
  id: number;
  name: string;
  provider: string;
  protocol: string;
  base_url: string;
  model_name: string;
  api_key_encrypted: string;
  temperature: string | null;
  max_tokens: number | null;
  is_default: number | boolean;
  is_active: number | boolean;
  last_tested_at: Date | null;
  last_test_status: string | null;
  last_test_error: string | null;
  created_by: string | null;
}

async function main(): Promise<void> {
  const mysql = await createConnection({
    host: dbConn.host,
    port: dbConn.port,
    user: dbConn.user,
    password: dbConn.pass,
    database: env.DB_ACM,
  });
  const [rows] = await mysql.query<MysqlRow[]>('SELECT * FROM ai_model_config');
  await mysql.end();
  console.log(`[mysql] 读取 ${rows.length} 行`);

  const pg = new Client({
    host: acmDbConn.host,
    port: acmDbConn.port,
    user: acmDbConn.user,
    password: acmDbConn.pass,
    database: acmDbConn.database,
  });
  await pg.connect();
  try {
    for (const r of rows) {
      await pg.query(
        `INSERT INTO ai_model_config
           (name, provider, protocol, base_url, model_name, api_key_encrypted,
            temperature, max_tokens, is_default, is_active,
            last_tested_at, last_test_status, last_test_error, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (name) DO NOTHING`,
        [
          r.name,
          r.provider,
          r.protocol,
          r.base_url,
          r.model_name,
          r.api_key_encrypted,
          r.temperature != null ? Number(r.temperature) : null,
          r.max_tokens,
          Boolean(r.is_default),
          Boolean(r.is_active),
          r.last_tested_at,
          r.last_test_status,
          r.last_test_error,
          r.created_by,
        ],
      );
      console.log(`[pg] inserted: ${r.name} (${r.provider}/${r.protocol})`);
    }
    const { rows: final } = await pg.query('SELECT id, name, is_default FROM ai_model_config ORDER BY id');
    console.log('[pg] 当前数据:', final);
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error('migrate failed:', err?.message ?? err);
  process.exit(1);
});
