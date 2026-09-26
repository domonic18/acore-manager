import { JOB_TASK } from '@/shared/enums/job-task';
import { inspectionTask } from './inspection-task';

// 任务处理器契约：run 返回进程退出码（0=成功 / 1=任务失败 / 2=启动致命错误，与 job-entry 对齐）
export interface TaskHandler {
  readonly name: string;
  run(params: Record<string, unknown>): Promise<number>;
}

// 任务注册表：新任务 = 新建 tasks/<name>-task.ts 并在此注册一行（入口与控制面不感知具体任务）
export const taskHandlers: Readonly<Record<string, TaskHandler>> = {
  [JOB_TASK.INSPECTION]: inspectionTask,
};
