import { useEffect, useState } from 'react';
import { Eye, KeyRound, RefreshCw } from 'lucide-react';
import { buildUrl } from '@/shared/api/client';
import { CopyButton } from '@/shared/components/CopyButton';
import { Skeleton } from '@/shared/components/Skeleton';
import { toast } from '@/shared/utils/toast.util';
import { mcpTokenApi } from '../api/mcp-token.api';

const inputClass =
  'w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring';
const btnClass =
  'inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50';
const dangerBtnClass =
  'inline-flex items-center gap-1 rounded-md border border-destructive px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50';

function mcpEndpoint(): string {
  const base = buildUrl('/api/mcp');
  return /^https?:\/\//i.test(base) ? base : `${window.location.origin}${base}`;
}

// MCP 接入面板：端点地址 + API-KEY（掩码 / 明文 / 轮换）+ Claude Code 接入命令
export function McpTokenPanel() {
  const [masked, setMasked] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [plain, setPlain] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const view = await mcpTokenApi.getView();
      setMasked(view.masked);
      setUpdatedAt(view.updatedAt);
    } catch (err) {
      toast.error((err as Error).message || '加载 MCP 配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleReveal = async () => {
    setBusy(true);
    try {
      const result = await mcpTokenApi.reveal();
      setPlain(result.apiKey);
      toast.success('已取回明文 API-KEY');
    } catch (err) {
      toast.error((err as Error).message || '取回明文失败');
    } finally {
      setBusy(false);
    }
  };

  const handleRotate = async () => {
    if (!window.confirm('确认轮换 MCP API-KEY？旧 key 立即失效，已接入的运营助手需要重新配置。')) return;
    setBusy(true);
    try {
      const result = await mcpTokenApi.rotate();
      setPlain(result.apiKey);
      await load();
      toast.success('已轮换 API-KEY，旧 key 已失效');
    } catch (err) {
      toast.error((err as Error).message || '轮换失败');
    } finally {
      setBusy(false);
    }
  };

  const endpoint = mcpEndpoint();
  const claudeCommand = plain
    ? `claude mcp add acm --transport http ${endpoint} --header "Authorization: Bearer ${plain}"`
    : null;

  if (loading) {
    return (
      <div className='max-w-2xl space-y-6' aria-busy='true' aria-label='MCP 配置加载中'>
        <section className='rounded-lg border border-border bg-card p-4 space-y-3'>
          <Skeleton className='h-5 w-32' />
          <Skeleton className='h-9 w-full' />
        </section>
        <section className='rounded-lg border border-border bg-card p-4 space-y-3'>
          <Skeleton className='h-5 w-24' />
          <Skeleton className='h-9 w-full' />
        </section>
      </div>
    );
  }

  return (
    <div className='max-w-2xl space-y-6'>
      <section className='rounded-lg border border-border bg-card p-4 space-y-3'>
        <h2 className='text-base font-semibold'>MCP 端点</h2>
        <p className='text-xs text-muted-foreground'>
          运营助手（Claude Code 等 MCP 客户端）通过该端点调用封号核实、深度分析等工具。
          协议为 Streamable HTTP，仅接受 POST。
        </p>
        <div>
          <label className='mb-1 block text-sm font-medium' htmlFor='mcp-endpoint'>
            端点地址
          </label>
          <div className='flex items-center gap-2'>
            <input id='mcp-endpoint' readOnly value={endpoint} className={inputClass} />
            <CopyButton text={endpoint} />
          </div>
        </div>
      </section>

      <section className='rounded-lg border border-border bg-card p-4 space-y-3'>
        <div className='flex items-center justify-between'>
          <h2 className='text-base font-semibold'>API-KEY</h2>
          {updatedAt && (
            <span className='text-xs text-muted-foreground'>
              最近更新：{new Date(updatedAt).toLocaleString('zh-CN')}
            </span>
          )}
        </div>
        <p className='text-xs text-muted-foreground'>
          单 key 鉴权，无有效期。轮换后旧 key 立即失效，需重新配置接入方。
          查看明文与轮换操作均记入审计日志。
        </p>
        <div>
          <label className='mb-1 block text-sm font-medium' htmlFor='mcp-api-key'>
            当前 key
          </label>
          <input
            id='mcp-api-key'
            readOnly
            value={plain ?? masked ?? '未配置'}
            className={`${inputClass} font-mono`}
          />
        </div>
        <div className='flex flex-wrap gap-2'>
          <button type='button' onClick={() => void handleReveal()} disabled={busy} className={btnClass}>
            <Eye className='h-3.5 w-3.5' />
            查看明文
          </button>
          <button type='button' onClick={() => void handleRotate()} disabled={busy} className={dangerBtnClass}>
            <RefreshCw className='h-3.5 w-3.5' />
            轮换
          </button>
          {plain && (
            <button type='button' onClick={() => setPlain(null)} className={btnClass}>
              <KeyRound className='h-3.5 w-3.5' />
              隐藏明文
            </button>
          )}
        </div>
        {claudeCommand && (
          <div>
            <label className='mb-1 block text-sm font-medium' htmlFor='mcp-claude-command'>
              Claude Code 接入命令
            </label>
            <div className='flex items-start gap-2'>
              <textarea
                id='mcp-claude-command'
                readOnly
                rows={2}
                value={claudeCommand}
                className={`${inputClass} font-mono text-xs`}
              />
              <CopyButton text={claudeCommand} />
            </div>
            <p className='mt-1 text-xs text-muted-foreground'>
              接入后可在 Claude Code 内用 <code className='font-mono'>/mcp</code> 调用工具。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
