import { registerAllDbTools } from './db-tools';
import { registerLogTools } from './log-tools';

// 白名单工具统一注册入口：registerTool 为 Map 覆盖语义 → 本函数幂等，供 agent-factory 与测试重复调用。

export function registerAllTools(): void {
  registerAllDbTools();
  registerLogTools();
}
