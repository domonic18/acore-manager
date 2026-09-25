import { z } from 'zod';
import { registerTool } from '@/agent/tools/registry';
import { readDefaultRealm } from '@/config/system-config.reader';
import { yesterdayCST } from '@/shared/utils/cst-date.util';

// 对话场景巡检触发（arch 3.3 tools/）：仅注册工具壳，执行体由 services/ai/inspection.service
// 经 setInspectionRunner 注入——依赖方向 services → agent，agent 内不得 import services。
// 触发为异步语义：后台执行（约 1-2 分钟），工具立即返回受理回执，报告完成后落库并推送飞书。

export interface InspectionRunInput {
  realm: string;
  date: string;
  trigger: 'cron' | 'manual' | 'chat';
}

export type InspectionRunner = (input: InspectionRunInput) => Promise<unknown>;

let runner: InspectionRunner | null = null;

export function setInspectionRunner(fn: InspectionRunner): void {
  runner = fn;
}

export function registerInspectionTools(): void {
  registerTool({
    name: 'trigger_inspection',
    description:
      '触发一次指定 realm 与日期的每日巡检（异步后台执行，约 1-2 分钟）。立即返回受理回执而非报告本身；' +
      '完成后报告落库并推送飞书，可提示用户稍后在报告页查看。date 缺省为上海时区的昨日，realm 缺省用系统默认 realm。',
    schema: z.object({
      realm: z.string().min(1).optional().describe('服务器 realm 名，未传时用系统默认 realm'),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe('巡检日期 YYYY-MM-DD，缺省为昨日'),
    }),
    handler: async (args) => {
      if (!runner) throw new Error('巡检服务未就绪（runner 未注入）');
      const { realm, date } = args as { realm?: string; date?: string };
      const finalRealm = realm ?? (await readDefaultRealm());
      const finalDate = date ?? yesterdayCST();
      void Promise.resolve(runner({ realm: finalRealm, date: finalDate, trigger: 'chat' })).catch(() => undefined);
      return { accepted: true, realm: finalRealm, date: finalDate };
    },
  });
}
