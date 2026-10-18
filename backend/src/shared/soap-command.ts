// SOAP 命令通道共用助手（自 gm-tool.service 抽出供 kick/私信等复用）

// AC 命令参数单行 + 双引号切分：引号换行会破坏语法，正文先归一化
export function sanitizeCommandArg(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/"/g, "'");
}

// worldserver 回执含 &#xD; 等实体残留，解码后再展示
export function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// RA 回执：从 SOAP 响应 XML 提取 <result> 文本；空回执视为已受理
export function extractResultText(xml: string): string {
  const match = /<result>([\s\S]*?)<\/result>/i.exec(xml);
  return decodeXmlEntities(match?.[1] ?? '').trim();
}

export function isReceiptError(text: string): boolean {
  return /ACErr|not found|not online|不存在|错误|error/i.test(text);
}
