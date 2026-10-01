import { registerAllDbTools } from './db-tools';
import { registerLogTools } from './log-tools';
import { registerInspectionTools } from './inspection-tools';
import { registerReportTools } from './report-tools';
import { registerTimeTools } from './time-tool';
import { registerAskUserTools } from './ask-user.tool';

// 白名单工具统一注册入口：registerTool 为 Map 覆盖语义 → 本函数幂等，供 agent-factory 与测试重复调用。

export function registerAllTools(): void {
  registerAllDbTools();
  registerLogTools();
  registerInspectionTools();
  registerReportTools();
  registerTimeTools();
  registerAskUserTools();
}
