import { useState } from 'react';
import { ChevronDown, Loader2, Mail, Search } from 'lucide-react';
import { useMailLogs, useMailTemplates, useSendMail } from '../hooks/useGmTool';
import { TargetInput } from './TargetInput';
import type { MailLogItem, MailTargetResult } from '@/shared/api/gm-mail';

// GM 邮件面板（通用发送 + 发送记录）：目标 chips 输入带角色名联想，预置模板下拉快速填充；
// 发送记录来自审计（逐目标一行），可按角色名过滤、展开正文与回执。

const MAX_BODY = 500;

function ResultRow({ r }: { r: MailTargetResult }) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 py-1.5 text-xs">
      <span className={`rounded px-1.5 py-0.5 font-semibold ${r.ok ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
        {r.ok ? '成功' : '失败'}
      </span>
      <span className="font-medium">{r.name}</span>
      {r.online != null && (
        <span className={`rounded bg-accent px-1.5 py-0.5 ${r.online ? 'text-green-400' : 'text-muted-foreground'}`}>
          {r.online ? '在线' : '离线'}
        </span>
      )}
      <span className="text-muted-foreground">{r.message}</span>
    </li>
  );
}

function LogRow({ log }: { log: MailLogItem }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="border-b border-border/60 align-top transition-colors hover:bg-accent/50">
        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
          {new Date(log.createdAt).toLocaleString('zh-CN', { hour12: false })}
        </td>
        <td className="px-3 py-2 text-muted-foreground">{log.operatorName}</td>
        <td className="px-3 py-2 font-medium">{log.characterName}</td>
        <td className="px-3 py-2">
          <span className="line-clamp-1 max-w-[220px] text-muted-foreground">{log.subject}</span>
        </td>
        <td className="px-3 py-2">
          <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold ${log.ok ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            {log.ok ? '成功' : '失败'}
          </span>
          {log.source === 'template' && <span className="ml-1.5 whitespace-nowrap rounded bg-sky-500/20 px-1.5 py-0.5 text-xs text-sky-400">模板</span>}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">{log.refReport ?? '—'}</td>
        <td className="px-3 py-2">
          <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} /> 详情
          </button>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-border/60 bg-muted/20">
          <td colSpan={7} className="px-3 py-2">
            <div className="space-y-1 text-xs">
              <p>
                <span className="font-semibold text-muted-foreground">正文：</span>
                <span className="leading-relaxed">{log.body}</span>
              </p>
              <p>
                <span className="font-semibold text-muted-foreground">回执：</span>
                <span className="font-mono text-muted-foreground">{log.result || '—'}</span>
                {log.online != null && <span className="ml-2 text-muted-foreground">（发送时{log.online ? '在线' : '离线'}）</span>}
              </p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function GmMailPanel() {
  const { data: templates } = useMailTemplates();
  const sendMail = useSendMail();

  const [targets, setTargets] = useState<string[]>([]);
  const [tplKey, setTplKey] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [results, setResults] = useState<MailTargetResult[] | null>(null);

  const [logPage, setLogPage] = useState(1);
  const [filterInput, setFilterInput] = useState('');
  const [filter, setFilter] = useState('');
  const { data: logs, isLoading: logsLoading } = useMailLogs(logPage, filter || undefined);

  const canSend = !sendMail.isPending && targets.length > 0 && subject.trim() !== '' && body.trim() !== '' && body.trim().length <= MAX_BODY;

  const applyTemplate = (key: string): void => {
    setTplKey(key);
    const tpl = templates?.find((t) => t.key === key);
    if (tpl) {
      setSubject(tpl.subject);
      setBody(tpl.body);
    }
  };

  const send = async (): Promise<void> => {
    setResults(null);
    const res = await sendMail.mutateAsync({ targets, subject: subject.trim(), body: body.trim(), source: tplKey !== '' ? 'template' : 'custom' });
    setResults(res.results);
  };

  const logItems = logs?.items ?? [];
  const hasNext = logItems.length === 20;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="mb-3 flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">发送邮件</h2>
          <span className="text-xs text-muted-foreground">经 worldserver 投递至游戏内邮箱，离线角色登录后可取；逐目标审计留痕</span>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">目标角色（输入联想，最多 50 个）</label>
              <TargetInput value={targets} onChange={setTargets} placeholder="输入角色名前缀，Enter 收录" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">邮件模板</label>
              <select
                value={tplKey}
                onChange={(e) => applyTemplate(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">自定义（不使用模板）</option>
                {(templates ?? []).map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">标题（1-100 字）</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={100}
                placeholder="【服务器管理】违规行为警告"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">正文（≤500 字，支持 {'{player}'}/{'{reason}'}/{'{date}'} 占位符逐目标渲染）</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={MAX_BODY}
                placeholder="亲爱的 {player}：…"
                className="min-h-[96px] w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
              <div className={`text-xs ${body.length > MAX_BODY ? 'text-destructive' : 'text-muted-foreground'}`}>{body.length}/{MAX_BODY}</div>
            </div>
            <button
              onClick={() => void send()}
              disabled={!canSend}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sendMail.isPending ? '发送中...' : '发送邮件'}
            </button>
            {sendMail.isError && <div className="text-xs text-destructive">{(sendMail.error as Error).message}</div>}
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">发送结果</label>
            {results == null ? (
              <div className="flex h-full min-h-[160px] items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                尚未发送，结果将逐目标展示
              </div>
            ) : (
              <ul className="space-y-1.5">
                {results.map((r) => (
                  <ResultRow key={r.name} r={r} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-lg font-semibold">发送记录</h2>
          <div className="ml-auto flex gap-2">
            <input
              value={filterInput}
              onChange={(e) => setFilterInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setLogPage(1);
                  setFilter(filterInput.trim());
                }
              }}
              placeholder="按角色名过滤"
              className="w-44 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={() => {
                setLogPage(1);
                setFilter(filterInput.trim());
              }}
              className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            >
              <Search className="h-3.5 w-3.5" /> 查询
            </button>
          </div>
        </div>

        {logsLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
          </div>
        ) : logItems.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">暂无发送记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">时间</th>
                  <th className="px-3 py-2 font-medium">操作人</th>
                  <th className="px-3 py-2 font-medium">角色</th>
                  <th className="px-3 py-2 font-medium">标题</th>
                  <th className="px-3 py-2 font-medium">结果</th>
                  <th className="px-3 py-2 font-medium">关联报告</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {logItems.map((log) => (
                  <LogRow key={log.id} log={log} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(logPage > 1 || hasNext) && (
          <div className="mt-3 flex items-center justify-end gap-2 text-sm">
            <button
              onClick={() => setLogPage((p) => Math.max(1, p - 1))}
              disabled={logPage <= 1}
              className="rounded-md border border-border px-2.5 py-1 text-muted-foreground disabled:opacity-40 hover:bg-accent"
            >
              上一页
            </button>
            <span className="text-muted-foreground">第 {logPage} 页</span>
            <button
              onClick={() => setLogPage((p) => p + 1)}
              disabled={!hasNext}
              className="rounded-md border border-border px-2.5 py-1 text-muted-foreground disabled:opacity-40 hover:bg-accent"
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
