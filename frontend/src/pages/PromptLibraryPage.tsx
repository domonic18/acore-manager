import { PromptLibraryView } from '@/features/prompt-library/components/PromptLibraryView';

export default function PromptLibraryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">提示词库</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Agent 场景提示词与技能文档的只读视图（文件为真源，修改提示词走仓库 git 提交）
        </p>
      </div>
      <PromptLibraryView />
    </div>
  );
}
