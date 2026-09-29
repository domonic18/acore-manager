import { registerAnomalyTool } from './anomaly-tool';
import { registerFetchTool } from './fetch-tool';
import { registerManifestTool } from './manifest-tool';
import { registerParseTool } from './parse-tool';

// 日志域白名单工具注册入口（4 个，需求 3.5 + 2026-09 异常标记补齐）：registerTool 为 Map 覆盖语义 → 幂等。

export function registerLogTools(): void {
  registerManifestTool();
  registerFetchTool();
  registerParseTool();
  registerAnomalyTool();
}
