import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// 聊天气泡内的 markdown 渲染（react-markdown 默认不渲染原始 HTML，无注入风险）。
// 样式按 text-sm 气泡场景定制，覆盖标题/列表/表格/代码块等 assistant 常用输出。
export function Markdown({ content }: { content: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="mb-1 mt-3 text-base font-semibold" {...p} />,
          h2: (p) => <h2 className="mb-1 mt-3 text-[15px] font-semibold" {...p} />,
          h3: (p) => <h3 className="mb-1 mt-2 text-sm font-semibold" {...p} />,
          p: (p) => <p className="whitespace-pre-wrap break-words" {...p} />,
          ul: (p) => <ul className="list-disc space-y-0.5 pl-5" {...p} />,
          ol: (p) => <ol className="list-decimal space-y-0.5 pl-5" {...p} />,
          li: (p) => <li className="break-words" {...p} />,
          blockquote: (p) => <blockquote className="border-l-2 border-border pl-2.5 text-muted-foreground" {...p} />,
          a: (p) => <a className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />,
          hr: () => <hr className="my-2 border-border" />,
          table: (p) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs" {...p} />
            </div>
          ),
          th: (p) => <th className="border border-border bg-muted/50 px-2 py-1 text-left font-medium" {...p} />,
          td: (p) => <td className="border border-border px-2 py-1 align-top" {...p} />,
          code: ({ className, children, ...rest }) => {
            const isBlock = /language-/.test(className ?? '');
            if (isBlock) {
              return (
                <code className="block font-mono text-xs" {...rest}>
                  {children}
                </code>
              );
            }
            return (
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs" {...rest}>
                {children}
              </code>
            );
          },
          pre: (p) => <pre className="overflow-x-auto rounded-lg border border-border bg-muted/60 p-2.5 text-xs" {...p} />,
          strong: (p) => <strong className="font-semibold" {...p} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
