import COS from 'cos-nodejs-sdk-v5';
import { env } from '@/config/env';
import { logger } from '@/middleware/request-logger';

// 腾讯云 COS 基础访问（日志归档桶 / AI 报告归档，桶私有读）。
// 放 shared/utils 而非 services/ai：agent/tools 的日志工具也要用，而 agent/ 禁止 import services/（目录结构规范 2.1）。
// 未配置（本地开发）时 cosConfigured()=false，调用方应给出明确提示而非静默失败。

let client: COS | null = null;

export function cosConfigured(): boolean {
  return Boolean(env.COS_SECRET_ID && env.COS_SECRET_KEY && env.COS_BUCKET && env.COS_REGION);
}

function cosClient(): COS {
  if (!cosConfigured()) throw new Error('COS 未配置（需要 COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION）');
  if (!client) client = new COS({ SecretId: env.COS_SECRET_ID, SecretKey: env.COS_SECRET_KEY });
  return client;
}

function bucketParams(): { Bucket: string; Region: string } {
  return { Bucket: env.COS_BUCKET, Region: env.COS_REGION };
}

export async function cosGetObjectBuffer(key: string): Promise<Buffer> {
  const res = await cosClient().getObject({ ...bucketParams(), Key: key });
  return Buffer.isBuffer(res.Body) ? res.Body : Buffer.from(res.Body as string);
}

export async function cosGetObjectJson<T>(key: string): Promise<T | null> {
  try {
    return JSON.parse((await cosGetObjectBuffer(key)).toString('utf8')) as T;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function cosPutObjectBuffer(key: string, body: Buffer, contentType = 'application/octet-stream'): Promise<void> {
  await cosClient().putObject({ ...bucketParams(), Key: key, Body: body, ContentType: contentType });
  logger.info(`[cos] put ${key} (${body.length} bytes)`);
}

function isNotFound(err: unknown): boolean {
  const e = err as { statusCode?: number; code?: string };
  return e?.statusCode === 404 || e?.code === 'NoSuchKey';
}
