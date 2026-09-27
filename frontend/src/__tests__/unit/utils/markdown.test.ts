import { describe, it, expect } from 'vitest';
import { markdownToHtml } from '@/shared/utils/markdown.util';

describe('markdown.util: markdownToHtml', () => {
  it('渲染标题/加粗/列表为 HTML 标签', () => {
    const html = markdownToHtml('## 结论\n\n**关键点**\n\n- 第一条\n- 第二条');
    expect(html).toContain('<h2>结论</h2>');
    expect(html).toContain('<strong>关键点</strong>');
    expect(html).toContain('<li>第一条</li>');
  });

  it('支持 GFM 表格（与站内 Markdown 组件口径一致）', () => {
    const html = markdownToHtml('| 日期 | 结论 |\n| --- | --- |\n| 09-27 | 维持 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>日期</th>');
    expect(html).toContain('<td>维持</td>');
  });

  it('普通段落换行不被吞掉（粘贴论坛后可读）', () => {
    const html = markdownToHtml('第一段\n\n第二段');
    expect(html).toContain('<p>第一段</p>');
    expect(html).toContain('<p>第二段</p>');
  });
});
