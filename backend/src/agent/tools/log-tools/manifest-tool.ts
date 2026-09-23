import { z } from 'zod';
import { cosGetObjectJson } from '@/shared/utils/cos.util';
import { registerTool } from '@/agent/tools/registry';
import { LOG_TYPES, manifestKey } from './log-workspace';

// get_log_manifest（需求 3.5）：读 COS manifest.json，返回当日日志构成与完整性。
// manifest 由游戏服上传脚本（M1）写入：文件清单 + 大小 + md5 + 行数。

export interface LogManifestFile {
  type: string;
  file: string;
  size: number;
  md5: string;
  lines?: number;
}

export interface LogManifest {
  realm: string;
  date: string;
  generatedAt?: string;
  files: LogManifestFile[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function registerManifestTool(): void {
  registerTool({
    name: 'get_log_manifest',
    description:
      '读取 COS 日志清单：当日（默认 realm3）已上传的日志文件构成、大小、md5、行数，并校验 worldserver/authserver/anticheat/crash 四类是否到齐。文件不存在返回 present=false（断传或未到上传时间）。',
    schema: z.object({
      date: z.string().regex(DATE_RE, 'date 需为 YYYY-MM-DD').describe('日志日期（上传按日凌晨传前一日）'),
      realm: z.string().min(2).default('realm3').describe('realm 目录名'),
    }),
    handler: async (args) => {
      const { date, realm } = args as { date: string; realm: string };
      // COS 未配置/网络异常属预期条件，返回结构化 note 供模型解释而非抛错（抛错会引发 superstep 级联失败）
      let manifest: LogManifest | null;
      try {
        manifest = await cosGetObjectJson<LogManifest>(manifestKey(realm, date));
      } catch (err) {
        return { present: false, note: `读取日志清单失败：${(err as Error).message}` };
      }
      if (!manifest) return { present: false, note: `COS 无 ${realm}/${date}/manifest.json（断传或尚未上传）` };
      const presentTypes = new Set(manifest.files.map((f) => f.type));
      const missingTypes = LOG_TYPES.filter((t) => !presentTypes.has(t));
      return { present: true, manifest, missingTypes };
    },
  });
}
