import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { Suspense } from 'react';
import { ChunkErrorBoundary } from '@/shared/components/ChunkErrorBoundary';
import { LoadFailureNotice } from '@/shared/components/LoadFailureNotice';
import { lazyWithRetry } from '@/shared/lib/chunk-load';

const CHUNK_ERROR = () => new TypeError('Failed to fetch dynamically imported module: /assets/x.js');

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

  it('retries and recovers from a transient chunk failure', async () => {
    const factory = vi.fn().mockRejectedValueOnce(CHUNK_ERROR()).mockResolvedValue({ default: () => <div>重试后恢复</div> });
    const Chunk = lazyWithRetry(factory, 'Test');

    render(
      <Suspense fallback={<div>加载中</div>}>
        <Chunk />
      </Suspense>,
    );

    expect(await screen.findByText('重试后恢复', undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('gives up after all retries and surfaces the error to the boundary', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const factory = vi.fn().mockRejectedValue(CHUNK_ERROR());
    const Chunk = lazyWithRetry(factory, 'Test');

    render(
      <ChunkErrorBoundary fallback={<div>已降级</div>}>
        <Suspense fallback={<div>加载中</div>}>
          <Chunk />
        </Suspense>
      </ChunkErrorBoundary>,
    );

    await waitFor(() => expect(screen.getByText('已降级')).toBeInTheDocument(), { timeout: 8000 });
    expect(screen.queryByText('Unexpected Application Error')).not.toBeInTheDocument();
    // 指数退避共 3 次尝试；每次都重新调用 factory（重新发起 import()）
    expect(factory).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('recovers when the caller rebuilds the boundary with a fresh lazy instance', async () => {
    const failedFactory = vi.fn().mockRejectedValue(CHUNK_ERROR());
    const recoveredFactory = vi.fn().mockResolvedValue({ default: () => <div>重建后恢复</div> });

    const { rerender } = render(
      <ChunkErrorBoundary key={0} fallback={<div>已降级</div>}>
        <Suspense fallback={<div>加载中</div>}>
          {(() => {
            const Broken = lazyWithRetry(failedFactory, 'Test');
            return <Broken />;
          })()}
        </Suspense>
      </ChunkErrorBoundary>,
    );

    await waitFor(() => expect(screen.getByText('已降级')).toBeInTheDocument(), { timeout: 8000 });

    // 模拟 AiAssistantDockGate 的重试路径：key 递增 + 全新 lazy 实例（新 factory 闭包）
    rerender(
      <ChunkErrorBoundary key={1} fallback={<div>已降级</div>}>
        <Suspense fallback={<div>加载中</div>}>
          {(() => {
            const Recovered = lazyWithRetry(recoveredFactory, 'Test');
            return <Recovered />;
          })()}
        </Suspense>
      </ChunkErrorBoundary>,
    );

    expect(await screen.findByText('重建后恢复', undefined, { timeout: 4000 })).toBeInTheDocument();
  });
});

describe('ChunkErrorBoundary fallback', () => {
  it('passes the caught error to a function fallback for message discrimination', async () => {
    const factory = vi.fn().mockRejectedValue(CHUNK_ERROR());
    const Chunk = lazyWithRetry(factory, 'Test');
    const renderFallback = vi.fn((error: Error) => <div>文案：{error.message.includes('Failed to fetch') ? '加载失败' : '运行异常'}</div>);

    render(
      <ChunkErrorBoundary fallback={renderFallback}>
        <Suspense fallback={null}>
          <Chunk />
        </Suspense>
      </ChunkErrorBoundary>,
    );

    await waitFor(() => expect(screen.getByText('文案：加载失败')).toBeInTheDocument(), { timeout: 8000 });
    expect(renderFallback).toHaveBeenCalledWith(expect.any(TypeError));
  });
});

describe('LoadFailureNotice', () => {
  it('offers in-place retry and full reload buttons when onRetry is provided', async () => {
    const onRetry = vi.fn();
    render(<LoadFailureNotice floating title="AI 助手加载失败" description="网络波动导致助手脚本未加载完成。" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: '重试加载' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '重新加载' })).toBeInTheDocument();
  });

  it('renders only the reload button without onRetry', () => {
    render(<LoadFailureNotice />);

    expect(screen.getByRole('button', { name: '重新加载' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重试加载' })).not.toBeInTheDocument();
  });
});
