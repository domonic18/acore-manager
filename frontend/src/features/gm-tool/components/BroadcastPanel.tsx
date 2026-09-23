import { useState } from 'react';
import { Radio } from 'lucide-react';
import { useBroadcast } from '../hooks/useGmTool';
import { toast } from '@/shared/utils/toast.util';

// GM 广播面板：`.announce` 全服公告，经 worldserver 投递。

export function BroadcastPanel() {
  const [message, setMessage] = useState('');
  const broadcastMutation = useBroadcast();

  const handleBroadcast = async (): Promise<void> => {
    if (!message.trim()) return;
    await broadcastMutation.mutateAsync(message);
    setMessage('');
    toast.success('广播发送成功');
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-3 flex items-center gap-2">
        <Radio className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">广播消息</h2>
        <span className="text-xs text-muted-foreground">全服公告（.announce），在线玩家聊天框可见</span>
      </div>
      <div className="max-w-xl space-y-3">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="输入广播内容"
          className="min-h-[80px] w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={() => void handleBroadcast()}
          disabled={broadcastMutation.isPending || message.trim() === ''}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {broadcastMutation.isPending ? '发送中...' : '发送广播'}
        </button>
        {broadcastMutation.isError && <div className="text-xs text-destructive">{(broadcastMutation.error as Error).message}</div>}
      </div>
    </div>
  );
}
