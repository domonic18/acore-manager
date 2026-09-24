import { z } from 'zod';
import { registerTool } from '@/agent/tools/registry';

// 人工确认工具（AskQuestion，参考 ai-invest-assisstant ask_user 模式）：
// 工具返回 __question__ 标记对象，wire 层检测后转为 SSE question 事件；
// 本轮自然结束后用户在界面点选项，回答作为普通新消息进入同 thread 续跑，
// 不使用 langgraph interrupt/Command resume。

const questionPayloadSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.object({ value: z.string(), label: z.string() })).min(2).max(5),
  default: z.string().optional(),
});

export function registerAskUserTools(): void {
  registerTool({
    name: 'ask_user',
    description:
      '当任务目标或关键参数存在多种合理解读、需要用户确认时，向用户提出带选项的问题。' +
      '调用后必须立即结束本轮回复，等待用户在界面上选择；不要在收到回答前继续臆测执行。' +
      '仅在关键歧义时使用（选项 2-5 个，value 唯一），不要为已明确的信息反复提问。',
    schema: z.object({
      question: z.string().min(1).describe('要问用户的问题，一句话'),
      options: z
        .array(z.object({ value: z.string().describe('选项值（回传用）'), label: z.string().describe('选项展示文案') }))
        .min(2)
        .max(5)
        .describe('候选选项，2-5 个'),
      default: z.string().optional().describe('推荐选项的 value'),
    }),
    handler: async (args) => {
      const parsed = questionPayloadSchema.safeParse(args);
      if (!parsed.success) {
        throw new Error(`ask_user 参数不合法: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
      }
      const { question, options, default: def } = parsed.data;
      const values = options.map((o) => o.value);
      if (new Set(values).size !== values.length) {
        throw new Error('ask_user 选项 value 必须唯一');
      }
      if (def !== undefined && !values.includes(def)) {
        throw new Error(`ask_user default=${def} 不在选项中`);
      }
      return { __question__: { question, options, default: def } };
    },
  });
}
