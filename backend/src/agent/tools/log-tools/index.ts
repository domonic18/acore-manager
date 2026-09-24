import { registerFetchTool } from './fetch-tool';
import { registerManifestTool } from './manifest-tool';
import { registerParseTool } from './parse-tool';

// 日志域白名单工具注册入口（3 个，需求 3.5）：registerTool 为 Map 覆盖语义 → 幂等。

export function registerLogTools(): void {
  registerManifestTool();
  registerFetchTool();
  registerParseTool();
}
