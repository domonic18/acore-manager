import { z } from 'zod';
import { cosGetObjectBuffer } from '@/shared/utils/cos.util';
import { registerTool } from '@/agent/tools/registry';
import { extractArchive, isLogType, listExtracted, logArchiveKey, workspaceDir } from './log-workspace';

// fetch_log_archive（需求 3.5）：下载 tar.gz → 解压至 /tmp/ai-workspace，返回可检索文件清单。
// 同任务内重复调用直接返回已解压内容（幂等）；解压经子进程 tar（T0.2 已验证可用）。

export function registerFetchTool(): void {
  registerTool({
    name: 'fetch_log_archive',
    description:
      '下载并解压指定日期与类型的日志包（worldserver/authserver/anticheat/crash）到临时工作区，返回文件路径与行数清单。之后可用 grep/read 在工作区自主检索，或用 parse_anticheat_violations 做代码级解析。',
    timeoutMs: 30_000,
    schema: z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date 需为 YYYY-MM-DD').describe('日志日期'),
      type: z.enum(['worldserver', 'authserver', 'anticheat', 'crash']).describe('日志类型'),
      realm: z.string().min(2).default('realm3').describe('realm 目录名'),
    }),
    handler: async (args) => {
      const { date, type, realm } = args as { date: string; type: string; realm: string };
      if (!isLogType(type)) throw new Error(`unknown log type: ${type}`);
      const dir = workspaceDir(realm, date, type);
      const cached = listExtracted(dir);
      if (cached.length > 0) return { files: cached, cached: true };
      const archive = await cosGetObjectBuffer(logArchiveKey(realm, date, type));
      const files = await extractArchive(realm, date, type, archive);
      return { files, cached: false };
    },
  });
}
