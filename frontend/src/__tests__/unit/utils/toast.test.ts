import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('toast', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.resetModules();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('creates a success toast', async () => {
    const { toast } = await import('@/shared/utils/toast.util');
    toast.success('Operation successful');

    const container = document.querySelector('.fixed.top-4.right-4');
    expect(container).not.toBeNull();

    const toastEl = container?.querySelector('div');
    expect(toastEl).not.toBeNull();
    expect(toastEl?.textContent).toBe('Operation successful');
    expect(toastEl?.className).toContain('bg-green-600');
  });

  it('creates an error toast', async () => {
    const { toast } = await import('@/shared/utils/toast.util');
    toast.error('Something went wrong');

    const container = document.querySelector('.fixed.top-4.right-4');
    const toastEl = container?.querySelector('div');
    expect(toastEl?.textContent).toBe('Something went wrong');
    expect(toastEl?.className).toContain('bg-red-600');
  });

  it('reuses the same container for multiple toasts', async () => {
    const { toast } = await import('@/shared/utils/toast.util');
    toast.success('First');
    toast.success('Second');

    const containers = document.querySelectorAll('.fixed.top-4.right-4');
    expect(containers.length).toBe(1);

    const toasts = containers[0].querySelectorAll('div');
    expect(toasts.length).toBe(2);
  });
});
