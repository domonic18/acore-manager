// 工具调用预算器（arch 3.3.1）：单任务实例——一次巡检 / 一次对话链各自独立，
// 经 invoke 的 configurable.budget 传入 registry 包装层，默认 20 次（env.AI_TOOL_CALL_BUDGET）。
export class ToolBudgetExceededError extends Error {
  readonly code = 'budget_exceeded';
  constructor(readonly toolName: string, readonly maxCalls: number) {
    super(`tool call budget exceeded (${maxCalls}) at: ${toolName}`);
  }
}

export class BudgetGuard {
  private used = 0;

  constructor(readonly maxCalls: number) {}

  consume(toolName: string): void {
    this.used += 1;
    if (this.used > this.maxCalls) throw new ToolBudgetExceededError(toolName, this.maxCalls);
  }

  get calls(): number {
    return this.used;
  }
}
