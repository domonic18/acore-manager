import { DataSource } from 'typeorm';
import { join } from 'path';
import { env } from './env';

const commonConfig = {
  type: 'mysql' as const,
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USER,
  password: env.DB_PASS,
  synchronize: false,
  logging: env.NODE_ENV === 'development',
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

export async function initializeDataSources(): Promise<void> {
  await Promise.all([
    authDataSource.initialize(),
    charactersDataSource.initialize(),
    worldDataSource.initialize(),
  ]);
}
