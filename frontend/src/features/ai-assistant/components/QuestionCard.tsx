import type { QuestionEvent } from '../api/ai-assistant.api';

// ask_user 提问卡（ai-invest ask_user 模式）：agent 任务不确定时在输入框上方
// 展示问题与选项按钮，点击选项即作为普通新消息发送（send(`我选择：…`)），同 thread 续跑。
export function QuestionCard({ payload, onSelect }: { payload: QuestionEvent; onSelect: (label: string) => void }) {
  return (
    <div className="mx-3 mb-2 rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">AI 提问</span>
        <p className="text-sm font-medium leading-relaxed">{payload.question}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {payload.options.map((opt) => {
          const isDefault = payload.default != null && opt.value === payload.default;
          return (
            <button
              key={opt.value}
              onClick={() => onSelect(opt.label)}
              className={`px-3 py-1.5 rounded-md border text-sm transition-colors hover:bg-accent ${
                isDefault ? 'border-primary text-primary' : 'border-border text-foreground'
              }`}
            >
              {opt.label}
              {isDefault && <span className="ml-1 text-xs opacity-70">（推荐）</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
