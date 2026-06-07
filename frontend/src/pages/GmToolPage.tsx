import { useState } from 'react';
import { useBroadcast } from '@/features/gm-tool/hooks/useGmTool';

export default function GmToolPage() {
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const broadcastMutation = useBroadcast();

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) return;
    await broadcastMutation.mutateAsync(broadcastMessage);
    setBroadcastMessage('');
    alert('广播发送成功');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">GM 工具</h1>

      <div className="max-w-xl">
        <ToolCard title="广播消息">
          <textarea
            value={broadcastMessage}
            onChange={(e) => setBroadcastMessage(e.target.value)}
            placeholder="输入广播内容"
            className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[80px] resize-none"
          />
          <button
            onClick={handleBroadcast}
            disabled={broadcastMutation.isPending}
            className="w-full py-2 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {broadcastMutation.isPending ? '发送中...' : '发送广播'}
          </button>
        </ToolCard>
      </div>
    </div>
  );
}

function ToolCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}
