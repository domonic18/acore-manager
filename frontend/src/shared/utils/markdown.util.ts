import { marked } from 'marked';

// 报告复制为 HTML 用：论坛回帖框等富文本编辑器不识别 markdown 源码，
// 粘贴需要渲染后的 HTML（gfm 与站内 Markdown 组件渲染口径一致，含表格）。
export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false, gfm: true }) as string;
}
