import { BudgetGuard, ToolBudgetExceededError } from '@/agent/runtime/budget-guard';

describe('BudgetGuard', () => {
  it('allows calls within budget', () => {
    const guard = new BudgetGuard(2);
    guard.consume('a');
    guard.consume('b');
    expect(guard.calls).toBe(2);
  });

  it('throws ToolBudgetExceededError beyond budget', () => {
    const guard = new BudgetGuard(1);
    guard.consume('a');
    expect(() => guard.consume('b')).toThrow(ToolBudgetExceededError);
    try {
      guard.consume('c');
    } catch (err) {
      expect((err as ToolBudgetExceededError).code).toBe('budget_exceeded');
      expect((err as ToolBudgetExceededError).toolName).toBe('c');
    }
  });
});
