import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { toast } from '@/shared/utils/toast.util';

// 跨页面复用的复制按钮（聊天消息、报告全文等）。getText 优先于 text：
// 传 getText 时点击瞬间才拉取最新内容，保证复制到与落库一致的版本。
// clipboard API 在非 https / 旧内核下不可用，降级为隐藏 textarea + execCommand。
// 传 formats（≥2 项）时并排渲染多个格式按钮（如 复制Markdown / 复制HTML），
// richHtml 的选项同时写入 text/html + text/plain 双剪贴板 flavor——论坛富文本
// 回帖框粘贴即保留排版，纯文本框则得到 HTML 源码。

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

async function copyHtml(html: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([html], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
  } catch {
    // 落到下方纯文本兜底
  }
  return copyText(html);
}

export interface CopyFormatOption {
  key: string;
  label: string;
  text: () => Promise<string>;
  richHtml?: boolean;
}

interface CopyButtonProps {
  text?: string;
  getText?: () => Promise<string>;
  formats?: CopyFormatOption[];
  className?: string;
}

export function CopyButton({ text, getText, formats, className }: CopyButtonProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const options: CopyFormatOption[] =
    formats && formats.length > 0
      ? formats
      : [
          {
            key: 'default',
            label: '复制',
            text: async () => (getText ? await getText().catch(() => '') : (text ?? '')),
          },
        ];

  const handleCopy = async (opt: CopyFormatOption) => {
    let content = '';
    try {
      content = await opt.text();
    } catch {
      content = '';
    }
    const ok = content ? await (opt.richHtml ? copyHtml(content) : copyText(content)) : false;
    if (!ok) {
      toast.error('复制失败');
      return;
    }
    setCopiedKey(opt.key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const renderButton = (opt: CopyFormatOption) => {
    const copied = copiedKey === opt.key;
    return (
      <button
        key={opt.key}
        type="button"
        onClick={() => void handleCopy(opt)}
        title={options.length > 1 ? `复制为${opt.label}` : '复制内容'}
        className="flex items-center gap-1 px-1 text-xs text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        {copied ? '已复制' : opt.label}
      </button>
    );
  };

  if (options.length === 1) {
    return <span className={cn('inline-flex', className)}>{renderButton(options[0])}</span>;
  }
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>{options.map(renderButton)}</span>
  );
}
