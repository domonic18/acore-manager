// Job 函数任务契约（控制面触发与执行面入口共享的任务名单一名来源；
// 事件格式见 job/job-entry.ts：{ "task": <JobTaskName>, "params": <object> }）
export const JOB_TASK = {
  INSPECTION: 'inspection',
} as const;

export type JobTaskName = (typeof JOB_TASK)[keyof typeof JOB_TASK];
