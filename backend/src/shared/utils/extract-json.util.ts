// 从 LLM 输出文本中截取首个 JSON 对象（容忍 ```json 围栏与前后说明文字），失败返回 null。
export function extractJson(text: string): unknown | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
