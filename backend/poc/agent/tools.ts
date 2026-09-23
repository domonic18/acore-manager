import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// 最小工具集：验证 deepagents 的工具调用回路（tool_calls → ToolMessage → 再推理）。
// get_server_time 模拟未来 read-only 数据库工具的形态（无副作用、返回结构化字符串）。
export const echoTool = tool(
  async ({ text }) => `echo: ${text}`,
  {
    name: 'echo',
    description: '原样返回输入文本，用于验证工具调用回路 / echoes the input text',
    schema: z.object({ text: z.string().describe('要回显的文本') }),
  },
);

export const getServerTimeTool = tool(
  async () => {
    const now = new Date();
    return JSON.stringify({
      iso: now.toISOString(),
      epochMs: now.getTime(),
      note: 'host-native process time, not game server time',
    });
  },
  {
    name: 'get_server_time',
    description: '获取当前进程所在主机的系统时间（ISO 8601 + epoch 毫秒）/ returns host system time',
    schema: z.object({}),
  },
);

export const pocTools = [echoTool, getServerTimeTool];
