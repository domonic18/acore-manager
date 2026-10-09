import { useMemo, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import type { PromptScene, SkillDoc } from '../api/prompt-library.api';
import { usePromptLibrary } from '../hooks/usePromptLibrary';

// 提示词库（只读）：场景提示词 + 技能文档全量展示，客户端关键字搜索；
// 仓库文件是唯一真源，本页无任何写路径——修改提示词走仓库 git 提交。

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => window.alert('复制失败'));
      }}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
      {copied ? '已复制' : '复制'}
    </button>
  );
}

// {{var}} 占位符高亮（模板变量与正文散文区分视觉）
function TemplateText({ text }: { text: string }) {
  const parts = text.split(/(\{\{\w+\}\})/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\{\{\w+\}\}$/.test(p) ? (
          <mark key={i} className="rounded bg-yellow-500/30 px-0.5 text-yellow-300">
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}

function match(text: string | undefined, kw: string): boolean {
  return (text ?? '').toLowerCase().includes(kw);
}

function SceneList({ scenes, activeKey, onSelect }: { scenes: PromptScene[]; activeKey: string; onSelect: (s: PromptScene) => void }) {
  return (
    <div className="space-y-1.5">
      {scenes.map((s) => (
        <button
          key={s.scene}
          type="button"
          onClick={() => onSelect(s)}
          className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
            s.scene === activeKey ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-accent'
          }`}
        >
          <p className="font-mono text-sm font-semibold">{s.scene}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{s.description || '（无描述）'}</p>
        </button>
      ))}
    </div>
  );
}

function SceneDetail({ scene }: { scene: PromptScene }) {
  return (
    <div className="space-y-3">
      {scene.description && <p className="text-sm text-muted-foreground">{scene.description}</p>}
      {scene.sections.map((sec) => (
        <div key={sec.key} className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">{sec.label || sec.key}</p>
            <CopyButton text={sec.content} />
          </div>
          <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-accent/30 p-3 font-mono text-xs">
            <TemplateText text={sec.content} />
          </pre>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        来源 {scene.sourcePath} · 更新于 {scene.updatedAt}
      </p>
    </div>
  );
}

function SkillDetail({ skills, activeName }: { skills: SkillDoc[]; activeName: string }) {
  const skill = skills.find((s) => s.name === activeName) ?? skills[0];
  if (!skill) return null;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-mono text-sm font-semibold">{skill.name}</p>
          <CopyButton text={skill.content} />
        </div>
        <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-accent/30 p-3 font-mono text-xs">{skill.content}</pre>
      </div>
    </div>
  );
}

export function PromptLibraryView() {
  const { data, isLoading, isError, error } = usePromptLibrary();
  const [tab, setTab] = useState<'scenes' | 'skills'>('scenes');
  const [q, setQ] = useState('');
  const [activeScene, setActiveScene] = useState('');
  const [activeSkill, setActiveSkill] = useState('');

  const kw = q.trim().toLowerCase();

  const scenes = useMemo(() => {
    const list = data?.scenes ?? [];
    if (!kw) return list;
    return list.filter(
      (s) => match(s.scene, kw) || match(s.description, kw) || s.sections.some((sec) => match(sec.label, kw) || match(sec.content, kw)),
    );
  }, [data?.scenes, kw]);

  const skills = useMemo(() => {
    const list = data?.skills ?? [];
    if (!kw) return list;
    return list.filter((s) => match(s.name, kw) || match(s.content, kw));
  }, [data?.skills, kw]);

  const tabBtn = (active: boolean): string =>
    `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
      active ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent'
    }`;

  const loading = isLoading ? (
    <p className="py-6 text-center text-sm text-muted-foreground">加载中…</p>
  ) : isError ? (
    <p className="py-6 text-center text-sm text-destructive">{(error as Error).message}</p>
  ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setTab('scenes')} className={tabBtn(tab === 'scenes')}>
          场景提示词（{data?.scenes.length ?? '…'}）
        </button>
        <button type="button" onClick={() => setTab('skills')} className={tabBtn(tab === 'skills')}>
          技能文档（{data?.skills.length ?? '…'}）
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索场景/内容…"
          className="ml-auto w-48 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {loading !== null ? (
        loading
      ) : tab === 'scenes' ? (
          scenes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{kw ? '无匹配场景' : '暂无场景提示词'}</p>
          ) : (
            <div className="flex flex-col gap-4 md:flex-row">
              <div className="md:w-64 md:shrink-0">
                <SceneList
                  scenes={scenes}
                  activeKey={scenes.some((s) => s.scene === activeScene) ? activeScene : scenes[0].scene}
                  onSelect={(s) => setActiveScene(s.scene)}
                />
              </div>
              <div className="min-w-0 flex-1">
                <SceneDetail scene={scenes.find((s) => s.scene === activeScene) ?? scenes[0]} />
              </div>
            </div>
          )
        ) : skills.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{kw ? '无匹配技能文档' : '暂无技能文档'}</p>
        ) : (
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="md:w-64 md:shrink-0">
              <div className="space-y-1.5">
                {skills.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => setActiveSkill(s.name)}
                    className={`w-full truncate rounded-lg border p-2.5 text-left font-mono text-sm transition-colors ${
                      (skills.some((x) => x.name === activeSkill) ? activeSkill : skills[0].name) === s.name
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-card hover:bg-accent'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <SkillDetail skills={skills} activeName={activeSkill} />
            </div>
          </div>
        )}
    </div>
  );
}
