import { DataSource } from 'typeorm';
import { join } from 'path';
import { acmDbConn, dbConn, env, isDevelopment } from './env';
import { logger } from '@/middleware/request-logger';

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

// acm 库为系统自有库（可写例外，见 docs/standard/数据库操作规范.md 第五节），使用 PostgreSQL（与游戏 MySQL 隔离）；
// 表结构由 docker/database/migrations 下的 SQL 迁移文件管理（npm run db:migrate），不使用 synchronize
export const acmDataSource = new DataSource({
  type: 'postgres',
  host: acmDbConn.host,
  port: acmDbConn.port,
  username: acmDbConn.user,
  password: acmDbConn.pass,
  database: acmDbConn.database,
  synchronize: false,
  logging: isDevelopment,
  entities: [join(__dirname, '..', 'entities', 'acm', '*.entity.{js,ts}')],
});

// 服务就绪生命周期：starting →(初始化成功)→ ready；starting →(预算耗尽)→ degraded；degraded →(自愈)→ ready
// 预算判断用惰性 Date.now()（无定时器泄漏，fake timers 友好）；initPromise 在首次成功时 resolve
export type ServiceState = 'starting' | 'ready' | 'degraded';

let serviceState: ServiceState = 'starting';
let initResolve: (() => void) | null = null;
const initPromise = new Promise<void>((resolve) => {
  initResolve = resolve;
});
const bootTs = Date.now();

export function getServiceState(): ServiceState {
  if (serviceState !== 'starting') return serviceState;
  return Date.now() - bootTs >= env.STARTUP_DB_BUDGET_MS ? 'degraded' : 'starting';
}

export function getInitPromise(): Promise<void> {
  return initPromise;
}

export async function initializeDataSources(): Promise<void> {
  const all = [authDataSource, charactersDataSource, worldDataSource, acmDataSource];
  // 部分失败重试时跳过已成功的（TypeORM 对二次 initialize 会告警）
  await Promise.all(all.filter((ds) => !ds.isInitialized).map((ds) => ds.initialize()));
  serviceState = 'ready';
  initResolve?.();
}

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 2_000;

export async function initializeDataSourcesWithRetry(): Promise<void> {
  let attempt = 1;
  while (true) {
    try {
      await initializeDataSources();
      logger.info('Database connections established / 数据库连接已建立');
      return;
    } catch (err) {
      // DB 是硬依赖，无限重试（指数退避 + 抖动，封顶 30s），等待自愈
      const backoff = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (attempt - 1)) + Math.random() * 1000;
      logger.warn(
        err,
        `Database connection failed (attempt ${attempt}), retrying in ${Math.round(backoff)}ms... / 数据库连接失败，${Math.round(backoff)}毫秒后重试...`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoff));
      attempt++;
    }
  }
}
