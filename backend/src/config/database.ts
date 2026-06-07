import { DataSource } from 'typeorm';
import { join } from 'path';
import { dbConn, env, isDevelopment } from './env';
import { logger } from '../middleware/request-logger';

const commonConfig = {
  type: 'mysql' as const,
  host: dbConn.host,
  port: dbConn.port,
  username: dbConn.user,
  password: dbConn.pass,
  synchronize: false,
  logging: isDevelopment,
};

export const authDataSource = new DataSource({
  ...commonConfig,
  database: env.DB_AUTH,
  entities: [join(__dirname, '..', 'entities', 'auth', '*.entity.{js,ts}')],
});

export const charactersDataSource = new DataSource({
  ...commonConfig,
  database: env.DB_CHARACTERS,
  entities: [join(__dirname, '..', 'entities', 'characters', '*.entity.{js,ts}')],
});

export const worldDataSource = new DataSource({
  ...commonConfig,
  database: env.DB_WORLD,
  entities: [join(__dirname, '..', 'entities', 'world', '*.entity.{js,ts}')],
});

let dataSourcesInitialized = false;

export function areDataSourcesReady(): boolean {
  return dataSourcesInitialized;
}

export async function initializeDataSources(): Promise<void> {
  await Promise.all([
    authDataSource.initialize(),
    charactersDataSource.initialize(),
    worldDataSource.initialize(),
  ]);
  dataSourcesInitialized = true;
}

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 3000;

export async function initializeDataSourcesWithRetry(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await initializeDataSources();
      logger.info('Database connections established / 数据库连接已建立');
      return;
    } catch (err) {
      logger.warn(
        err,
        `Database connection failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS}ms... / 数据库连接失败，${RETRY_DELAY_MS}毫秒后重试...`,
      );
      if (attempt === MAX_RETRIES) {
        logger.error(err, 'Database connection exhausted all retries / 数据库连接已用尽所有重试次数');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}
