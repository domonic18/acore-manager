import { env } from '@/config/env';
import { invokeScfFunction } from '@/shared/utils/scf-invoke.util';
import type { JobTaskName } from '@/shared/enums/job-task';

// 控制面通用 Job 触发器：组 JSON 事件 → SCF Invoke（InvocationType=Event 异步受理）→ 返回 RequestId。
// 执行一律在 SCF Job 函数，Web 进程不承载任务本体；未来新任务复用本服务，无需改结构。

export class ServiceError extends Error {
  constructor(
    message: string,
    public status: number = 400,
  ) {
    super(message);
  }
}

const REQUIRED_ENV_KEYS = ['TENCENT_SECRET_ID', 'TENCENT_SECRET_KEY', 'SCF_REGION', 'SCF_JOB_FUNCTION_NAME'] as const;

// 列出缺失的 SCF 必需配置（供快速失败报错与运维诊断）
export function listMissingScfEnv(config: Partial<Record<(typeof REQUIRED_ENV_KEYS)[number], string>> = env): string[] {
  return REQUIRED_ENV_KEYS.filter((key) => !config[key]);
}

export async function triggerJob(
  task: JobTaskName,
  params: Record<string, unknown>,
): Promise<{ requestId: string | null }> {
  const missing = listMissingScfEnv();
  if (missing.length > 0) {
    throw new ServiceError(`SCF 触发未配置：缺少环境变量 ${missing.join('、')}（见 .env.example）`, 502);
  }

  try {
    const { requestId } = await invokeScfFunction({
      functionName: env.SCF_JOB_FUNCTION_NAME,
      namespace: env.SCF_NAMESPACE,
      region: env.SCF_REGION,
      secretId: env.TENCENT_SECRET_ID,
      secretKey: env.TENCENT_SECRET_KEY,
      clientContext: JSON.stringify({ task, params }),
      endpoint: env.SCF_ENDPOINT || undefined,
    });
    return { requestId };
  } catch (err) {
    // 协议层错误（签名/网络/SCF API Error）统一转 502，错误码保留在消息里便于运维定位
    throw new ServiceError((err as Error).message, 502);
  }
}
