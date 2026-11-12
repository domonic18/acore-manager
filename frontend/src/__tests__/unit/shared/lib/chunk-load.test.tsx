import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { ChunkErrorBoundary } from '@/shared/components/ChunkErrorBoundary';
import { lazyWithRetry } from '@/shared/lib/chunk-load';

describe('lazyWithRetry', () => {
  it('resolves the chunk on first attempt', async () => {
    const factory = vi.fn().mockResolvedValue({ default: () => <div>已加载</div> });
    const Chunk = lazyWithRetry(factory, 'Test');

    render(
      <Suspense fallback={<div>加载中</div>}>
        <Chunk />
      </Suspense>,
    );

    expect(await screen.findByText('已加载')).toBeInTheDocument();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('retries once and recovers from a transient chunk failure', async () => {
    const factory = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module: /assets/x.js'))
      .mockResolvedValue({ default: () => <div>重试后恢复</div> });
    const Chunk = lazyWithRetry(factory, 'Test');

    render(
      <Suspense fallback={<div>加载中</div>}>
        <Chunk />
      </Suspense>,
    );

    expect(await screen.findByText('重试后恢复')).toBeInTheDocument();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('gives up after the retry and surfaces the error to the boundary', async () => {
    const factory = vi.fn().mockRejectedValue(new TypeError('Failed to fetch dynamically imported module: /assets/x.js'));
    const Chunk = lazyWithRetry(factory, 'Test');

    render(
      <ChunkErrorBoundary fallback={<div>已降级</div>}>
        <Suspense fallback={<div>加载中</div>}>
          <Chunk />
        </Suspense>
      </ChunkErrorBoundary>,
    );

    await waitFor(() => expect(screen.getByText('已降级')).toBeInTheDocument());
    expect(screen.queryByText('Unexpected Application Error')).not.toBeInTheDocument();
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
