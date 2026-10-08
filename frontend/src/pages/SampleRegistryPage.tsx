import { SampleRegistryView } from '@/features/ai-diagnosis/components/SampleRegistryView';

export default function SampleRegistryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">样本与场景库</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          巡查样本（goodcase/badcase 标注语料）与误报场景（任务传送点/已知误报）的维护入口；场景条目即时生效于巡检误报解释
        </p>
      </div>
      <SampleRegistryView />
    </div>
  );
}
