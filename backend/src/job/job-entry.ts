import 'reflect-metadata';
import '@/config/load-env';
import { logger } from '@/middleware/request-logger';
import { taskHandlers } from './tasks/registry';

// SCF 容器函数唯一入口（docker/Dockerfile.job ENTRYPOINT）。事件经环境变量
// SCF_CUSTOM_CONTAINER_EVENT 注入（SquadSight 生产验证的容器事件通道），JSON 契约：
//   {"task": "inspection", "params": {"date": "YYYY-MM-DD", "realm": "realm2", "trigger": "cron|manual"}}
// 本地调试：SCF_CUSTOM_CONTAINER_EVENT='<json>' node dist/job/job-entry.js
// 退出码：0 = 任务成功；1 = 任务失败（服务内部已落 failed 行并告警）；2 = 启动致命错误（事件缺失/非法、
// 未知任务、数据源不可达），未进入任务流程。

export interface JobEvent {
  task: string;
  params: Record<string, unknown>;
}

// Timer 触发器会把附加消息包一层 {Type:'Timer', Message:'<json>'}，归一化取 Message（SquadSight 同款）
export function parseJobEvent(raw: string): JobEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`事件不是合法 JSON：${(err as Error).message}`, { cause: err });
  }

  if (parsed && typeof parsed === 'object' && (parsed as { Type?: unknown }).Type === 'Timer') {
    const message = (parsed as { Message?: unknown }).Message;
    if (typeof message !== 'string') throw new Error('Timer 事件缺少 Message 字符串');
    try {
      parsed = JSON.parse(message);
    } catch (err) {
      throw new Error(`Timer Message 不是合法 JSON：${(err as Error).message}`, { cause: err });
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('事件必须是 {task, params} 对象');
  }
  const { task, params } = parsed as { task?: unknown; params?: unknown };
  if (typeof task !== 'string' || task.trim() === '') throw new Error('事件缺少 task 字符串字段');
  if (params !== undefined && (typeof params !== 'object' || params === null || Array.isArray(params))) {
    throw new Error('params 必须是对象');
  }
  return { task, params: (params ?? {}) as Record<string, unknown> };
}

export async function runJobEntry(env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const raw = env.SCF_CUSTOM_CONTAINER_EVENT;
  if (raw === undefined || raw.trim() === '') {
    logger.error('[job-entry] 缺少事件：请经 SCF_CUSTOM_CONTAINER_EVENT 注入，如 \'{"task":"inspection","params":{"trigger":"cron"}}\'');
    return 2;
  }

  let event: JobEvent;
  try {
    event = parseJobEvent(raw);
  } catch (err) {
    logger.error(`[job-entry] ${(err as Error).message}`);
    return 2;
  }

  const handler = taskHandlers[event.task];
  if (!handler) {
    logger.error(`[job-entry] 未知任务 ${event.task}（已知：${Object.keys(taskHandlers).join(', ')}）`);
    return 2;
  }

  return handler.run(event.params);
}

if (require.main === module) {
  void runJobEntry().then((code) => process.exit(code));
}
