import type { ReactNode } from 'react';

type ColorTone = 'red' | 'green' | 'yellow' | 'blue' | 'orange' | 'amber' | 'gray';

// 类名必须整串字面量（Tailwind 扫描源码，拼串类名不生成）
const TEXT_TONES: Record<ColorTone | 'muted', string> = {
  red: 'text-red-400',
  green: 'text-green-400',
  yellow: 'text-yellow-400',
  blue: 'text-blue-400',
  orange: 'text-orange-400',
  amber: 'text-amber-400',
  gray: 'text-gray-400',
  muted: 'text-muted-foreground',
};

const PILL_TONES: Record<ColorTone, string> = {
  red: 'bg-red-500/20 text-red-400',
  green: 'bg-green-500/20 text-green-400',
  yellow: 'bg-yellow-500/20 text-yellow-400',
  blue: 'bg-blue-500/20 text-blue-400',
  orange: 'bg-orange-500/20 text-orange-400',
  amber: 'bg-amber-500/20 text-amber-400',
  gray: 'bg-gray-500/20 text-gray-400',
};

interface StatusBadgeProps {
  tone?: ColorTone | 'muted';
  variant?: 'text' | 'pill';
  className?: string;
  children: ReactNode;
}

// 状态着色文本（生效中/已解除/在线/离线）与 pill 徽标（GM 等级/健康分）
export function StatusBadge({ tone = 'muted', variant = 'text', className = '', children }: StatusBadgeProps) {
  if (variant === 'pill') {
    return (
      <span className={`inline-flex px-2 py-0.5 rounded text-xs ${PILL_TONES[tone as ColorTone]} ${className}`}>
        {children}
      </span>
    );
  }
  return <span className={`${TEXT_TONES[tone]} ${className}`}>{children}</span>;
}
