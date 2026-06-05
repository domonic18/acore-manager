import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '9000', 10),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  DB_URL: process.env.DB_URL,
  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_PORT: parseInt(process.env.DB_PORT || '3306', 10),
  DB_USER: process.env.DB_USER || 'acore',
  DB_PASS: process.env.DB_PASS || 'acore',
  DB_AUTH: process.env.DB_AUTH || 'acore_auth',
  DB_CHARACTERS: process.env.DB_CHARACTERS || 'acore_characters',
  DB_WORLD: process.env.DB_WORLD || 'acore_world',

  REDIS_URL: process.env.REDIS_URL,
  REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_EXPIRE_TIME: parseInt(process.env.REDIS_EXPIRE_TIME || '300', 10),

  JWT_SECRET: process.env.JWT_SECRET || 'change-me-in-production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',

  SOAP_HOST: process.env.SOAP_HOST || '127.0.0.1',
  SOAP_PORT: parseInt(process.env.SOAP_PORT || '7878', 10),
  SOAP_USER: process.env.SOAP_USER || 'admin',
  SOAP_PASS: process.env.SOAP_PASS || 'admin',

  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '',
} as const;
