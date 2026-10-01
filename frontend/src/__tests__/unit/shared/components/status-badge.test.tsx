import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '@/shared/components/StatusBadge';

describe('StatusBadge', () => {
  it('renders colored text by default', () => {
    render(<StatusBadge tone="green">在线</StatusBadge>);
    expect(screen.getByText('在线')).toHaveClass('text-green-400');
  });

  it('defaults to muted tone', () => {
    render(<StatusBadge>离线</StatusBadge>);
    expect(screen.getByText('离线')).toHaveClass('text-muted-foreground');
  });

  it('pill variant uses translucent background', () => {
    render(<StatusBadge tone="red" variant="pill">3</StatusBadge>);
    expect(screen.getByText('3')).toHaveClass('bg-red-500/20', 'text-red-400');
  });

  it('appends extra className', () => {
    render(<StatusBadge tone="red">生效中</StatusBadge>);
    expect(screen.getByText('生效中')).toHaveClass('text-red-400');
  });
});
