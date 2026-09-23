import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { toast } from '@/shared/utils/toast.util';

// 跨页面复用的复制按钮（聊天消息、报告全文等）。getText 优先于 text：
// 传 getText 时点击瞬间才拉取最新内容，保证复制到与落库一致的版本。
// clipboard API 在非 https / 旧内核下不可用，降级为隐藏 textarea + execCommand。

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

interface CopyButtonProps {
  text?: string;
  getText?: () => Promise<string>;
  className?: string;
}

export function CopyButton({ text, getText, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    let content: string | null = null;
    if (getText) {
      content = await getText().catch(() => null);
    } else {
      content = text ?? null;
    }
    if (content == null || !(await copyText(content))) {
      toast.error('复制失败');
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      title="复制内容"
      className={cn('flex items-center gap-1 px-1 text-xs text-muted-foreground/70 transition-colors hover:text-foreground', className)}
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      {copied ? '已复制' : '复制'}
    </button>
  );
}
