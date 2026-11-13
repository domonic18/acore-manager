// 工具连续失败熔断（P0-1）：单任务实例内，同一工具连续失败达到阈值后跳过调用，
// 防止弱模型在错误的参数形状上反复重试导致上下文/token 失控。
export class ToolFailureGuard {
  private readonly streaks = new Map<string, number>();

  constructor(readonly threshold: number) {}

  /** 记录一次失败；返回是否已熔断 */
  fail(slot: string): boolean {
    const n = (this.streaks.get(slot) ?? 0) + 1;
    this.streaks.set(slot, n);
    return n >= this.threshold;
  }

  /** 成功后清零该槽位 */
  succeed(slot: string): void {
    this.streaks.delete(slot);
  }

  isOpen(slot: string): boolean {
    return (this.streaks.get(slot) ?? 0) >= this.threshold;
  }
}
