import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBanFlow } from '@/shared/hooks/useBanFlow';

describe('useBanFlow', () => {
  it('starts idle with default duration and reason', () => {
    const { result } = renderHook(() => useBanFlow());
    expect(result.current.stage).toBe('idle');
    expect(result.current.isOpen).toBe(false);
    expect(result.current.duration).toBe('1d');
    expect(result.current.reasonType).toBe('违规');
    expect(result.current.finalReason).toBe('违规');
    expect(result.current.canProceed).toBe(true);
  });

  it('blocks proceeding when custom reason is blank', () => {
    const { result } = renderHook(() => useBanFlow());
    act(() => result.current.openForm());
    act(() => result.current.setReasonType('__custom__'));
    expect(result.current.canProceed).toBe(false);
    act(() => result.current.proceedToConfirm());
    expect(result.current.stage).toBe('form');
  });

  it('trims custom reason into finalReason', () => {
    const { result } = renderHook(() => useBanFlow());
    act(() => result.current.openForm());
    act(() => result.current.setReasonType('__custom__'));
    act(() => result.current.setCustomReason('  恶意脚本  '));
    expect(result.current.canProceed).toBe(true);
    expect(result.current.finalReason).toBe('恶意脚本');
  });

  it('walks the full state machine form → confirm → back → close', () => {
    const { result } = renderHook(() => useBanFlow());
    act(() => result.current.openForm());
    expect(result.current.stage).toBe('form');
    act(() => result.current.setDuration('7d'));
    act(() => result.current.proceedToConfirm());
    expect(result.current.stage).toBe('confirm');
    expect(result.current.isConfirming).toBe(true);
    act(() => result.current.backToForm());
    expect(result.current.stage).toBe('form');
    expect(result.current.duration).toBe('7d');
    act(() => result.current.closeAll());
    expect(result.current.stage).toBe('idle');
    expect(result.current.isOpen).toBe(false);
  });

  it('openForm resets the form state', () => {
    const { result } = renderHook(() => useBanFlow());
    act(() => result.current.openForm());
    act(() => result.current.setDuration('-1'));
    act(() => result.current.setReasonType('__custom__'));
    act(() => result.current.setCustomReason('x'));
    act(() => result.current.closeAll());
    act(() => result.current.openForm());
    expect(result.current.duration).toBe('1d');
    expect(result.current.reasonType).toBe('违规');
    expect(result.current.customReason).toBe('');
  });
});
