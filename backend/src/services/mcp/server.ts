import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { auditLogService } from '@/services/audit-log.service';
import { listBans, checkAccountBanned } from './tools/ban-tools';
import { createTargetedAnalysis, listTargetedAnalyses, getTargetedAnalysis } from './tools/analysis-tools';

// MCP 服务端工具注册（账号申诉闭环所需）
// 协议端点见 routes/mcp.routes.ts：Streamable HTTP 无状态模式，每次请求新建 server + transport。

export const MCP_TOOL_NAMES = [
  'list_bans',
  'check_account_banned',
  'create_targeted_analysis',
  'list_targeted_analyses',
  'get_targeted_analysis',
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export const MCP_OPERATOR_NAME = 'mcp-agent';

export function textResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function auditToolCall(tool: string, details: string): Promise<void> {
  await auditLogService.record({
    operatorId: 0,
    operatorName: MCP_OPERATOR_NAME,
    operation: 'mcp.tool.called',
    target: tool,
    details,
  });
}

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'acore-manager', version: '1.0.0' });

  server.registerTool(
    'list_bans',
    {
      title: '封号列表查询',
      description:
        '查询当前生效的封号列表（账号封禁 + 角色封禁），支持按账号名 / 角色名模糊过滤与分页。' +
        '账号申诉核实的第一步：确认申诉账号是否在封禁名单内。',
      inputSchema: {
        page: z.number().int().min(1).optional().describe('页码，从 1 开始，默认 1'),
        pageSize: z.number().int().min(1).max(100).optional().describe('每页条数，默认 20，最大 100'),
        username: z.string().min(1).optional().describe('账号名，模糊匹配（大小写不敏感）'),
        characterName: z.string().min(1).optional().describe('角色名，模糊匹配'),
        banType: z.enum(['account', 'character']).optional().describe('封禁类型：账号封禁或角色封禁'),
      },
    },
    async (args) => {
      try {
        const data = await listBans(args);
        await auditToolCall('list_bans', `total=${data.total} page=${data.page} size=${data.pageSize}`);
        return textResult(data);
      } catch (err) {
        return errorResult(`查询封号列表失败：${errorMessage(err)}`);
      }
    },
  );

  server.registerTool(
    'check_account_banned',
    {
      title: '账号封号核实',
      description:
        '按账号名核实单个账号：是否存在于封号列表、当前生效封禁明细、历史封禁记录与名下角色。' +
        '账号名大小写不敏感。',
      inputSchema: {
        username: z.string().min(1).describe('待核实的账号名'),
      },
    },
    async (args) => {
      try {
        const data = await checkAccountBanned(args.username);
        await auditToolCall('check_account_banned', `username=${args.username} found=${data.found} banned=${data.banned}`);
        return textResult(data);
      } catch (err) {
        return errorResult(`账号封号核实失败：${errorMessage(err)}`);
      }
    },
  );

  server.registerTool(
    'create_targeted_analysis',
    {
      title: '发起深度分析',
      description:
        '对指定账号或角色发起深度（定向）分析。分析异步执行，先返回记录 id，之后用 ' +
        'list_targeted_analyses / get_targeted_analysis 跟踪与取报告。' +
        '未指定时间范围时默认以封禁时间为准：封禁日往前 7 天 ~ 封禁日；查不到封禁则用最近 7 天。',
      inputSchema: {
        subjectNames: z
          .array(z.string().min(1))
          .min(1)
          .max(10)
          .describe('分析对象（账号名或角色名），单次最多 10 个'),
        subjectType: z.enum(['character', 'account']).optional().describe('对象类型，默认 character'),
        realm: z.string().min(1).optional().describe('realm 名，默认取系统配置里的默认 realm'),
        timeFrom: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe('起始日期 YYYY-MM-DD；与 timeTo 同时给出才会生效'),
        timeTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('结束日期 YYYY-MM-DD'),
        banContext: z
          .object({
            date: z.string().optional(),
            reason: z.string().optional(),
            bannedBy: z.string().optional(),
          })
          .optional()
          .describe('封禁上下文（不填则自动从封禁记录提取）'),
      },
    },
    async (args) => {
      try {
        const data = await createTargetedAnalysis(args);
        await auditToolCall(
          'create_targeted_analysis',
          `subjects=${args.subjectNames.join(',')} window=${data.timeFrom}~${data.timeTo} source=${data.timeWindowSource}`,
        );
        return textResult(data);
      } catch (err) {
        return errorResult(`发起深度分析失败：${errorMessage(err)}`);
      }
    },
  );

  server.registerTool(
    'list_targeted_analyses',
    {
      title: '深度分析进展查询',
      description:
        '分页查询深度分析记录及其状态（running / ok / failed），用于定期跟踪分析进展。' +
        'hasReport 表示该记录已有可读的分析报告。',
      inputSchema: {
        status: z.enum(['running', 'ok', 'failed']).optional().describe('按状态过滤'),
        subjectName: z.string().min(1).optional().describe('分析对象名，模糊匹配'),
        page: z.number().int().min(1).optional().describe('页码，从 1 开始，默认 1'),
        pageSize: z.number().int().min(1).max(100).optional().describe('每页条数，默认 20，最大 100'),
      },
    },
    async (args) => {
      try {
        const data = await listTargetedAnalyses(args);
        await auditToolCall('list_targeted_analyses', `total=${data.total} page=${data.page} status=${args.status ?? 'all'}`);
        return textResult(data);
      } catch (err) {
        return errorResult(`查询分析进展失败：${errorMessage(err)}`);
      }
    },
  );

  server.registerTool(
    'get_targeted_analysis',
    {
      title: '深度分析报告查询',
      description:
        '按记录 id 取深度分析报告：状态、结构化结论（违规项 / 误报信号 / 证据 / 处置建议）与 Markdown 正文。' +
        '用于与论坛申诉帖中的玩家陈述逐条比对。',
      inputSchema: {
        id: z.number().int().min(1).describe('分析记录 id'),
      },
    },
    async (args) => {
      try {
        const data = await getTargetedAnalysis(args.id);
        await auditToolCall('get_targeted_analysis', `id=${args.id} status=${data.status} hasReport=${data.hasReport}`);
        return textResult(data);
      } catch (err) {
        return errorResult(`查询分析报告失败：${errorMessage(err)}`);
      }
    },
  );

  return server;
}
