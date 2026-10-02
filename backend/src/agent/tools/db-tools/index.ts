import { registerAccountTools } from './account-tools';
import { registerAnticheatTools } from './anticheat-tools';
import { registerCharacterTools } from './character-tools';
import { registerMetricsTools } from './metrics-tools';
import { registerReferenceTools } from './reference-tools';

// DB 白名单工具统一注册入口（13 个，需求 3.5）：registerTool 为 Map 覆盖语义 → 本函数幂等，
// 供 agent-factory 与测试重复调用。

export function registerAllDbTools(): void {
  registerCharacterTools();
  registerAccountTools();
  registerAnticheatTools();
  registerMetricsTools();
  registerReferenceTools();
}
