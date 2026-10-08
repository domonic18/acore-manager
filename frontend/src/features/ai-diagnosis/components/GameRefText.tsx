// 游戏词条链接化：纯文本字段中的「任务/物品/节点/GameObject/NPC/成就 {id}」渲染为
// nfuwow 中文数据库超链接（新窗口）。与后端 report-tools/markdown.ts 的
// linkifyGameRefs 同一模式约定——markdown 字段由后端直接链接化，纯文本字段在此兜底。
// 基址复用文档已声明的 VITE_AOWOW_BASE_URL（aowow 架构站点），默认 nfuwow 80 级库。

const GAME_REF_BASE: string =
  (import.meta.env.VITE_AOWOW_BASE_URL as string | undefined) ?? 'https://db.nfuwow.com/80/';

export type GameRefSegment = { kind: 'text'; value: string } | { kind: 'link'; label: string; url: string };

const REF_PATTERN = /(任务|物品|节点|GameObject|NPC|成就)\s*#?(\d{1,7})(?!\d)/g;

export function parseGameRefs(text: string): GameRefSegment[] {
  const segments: GameRefSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(REF_PATTERN)) {
    const start = m.index ?? 0;
    if (start > last) segments.push({ kind: 'text', value: text.slice(last, start) });
    const prefix = m[1];
    const path = prefix === '任务' ? 'quest' : prefix === '物品' ? 'item' : prefix === 'NPC' ? 'npc' : prefix === '成就' ? 'achievement' : 'object';
    segments.push({ kind: 'link', label: m[0], url: `${GAME_REF_BASE}?${path}=${m[2]}` });
    last = start + m[0].length;
  }
  if (last < text.length) segments.push({ kind: 'text', value: text.slice(last) });
  return segments;
}

export function GameRefText({ text }: { text: string }) {
  return (
    <>
      {parseGameRefs(text).map((seg, i) =>
        seg.kind === 'text' ? (
          <span key={i}>{seg.value}</span>
        ) : (
          <a
            key={i}
            href={seg.url}
            target="_blank"
            rel="noreferrer"
            title="在 nfuwow 数据库中查看"
            className="text-primary underline underline-offset-2 hover:opacity-80"
          >
            {seg.label}
          </a>
        ),
      )}
    </>
  );
}
