import { useState } from 'react';
import { Plus } from 'lucide-react';
import { ModelConfig } from '@/features/model-config/api/model-config.api';
import {
  useModelConfigs,
  useSetDefaultModelConfig,
  useTestModelConfig,
} from '@/features/model-config/hooks/useModelConfig';
import { ModelConfigTable } from '@/features/model-config/components/ModelConfigTable';
import { ModelConfigFormDialog } from '@/features/model-config/components/ModelConfigFormDialog';
import { ModelConfigDeleteDialog } from '@/features/model-config/components/ModelConfigDeleteDialog';
import { toast } from '@/shared/utils/toast.util';

export default function ModelConfigPage() {
  const { data: configs, isLoading } = useModelConfigs();
  const setDefaultMutation = useSetDefaultModelConfig();
  const testMutation = useTestModelConfig();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ModelConfig | null>(null);
  const [deleting, setDeleting] = useState<ModelConfig | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (config: ModelConfig) => {
    setEditing(config);
    setFormOpen(true);
  };

  const handleTest = async (config: ModelConfig) => {
    setTestingId(config.id);
    try {
      const result = await testMutation.mutateAsync(config.id);
      if (result.ok) {
        toast.success(`测试连接成功（${result.latencyMs}ms）`);
      } else {
        toast.error(`测试连接失败：${result.error?.slice(0, 120) ?? '未知错误'}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '测试连接失败');
    } finally {
      setTestingId(null);
    }
  };

  const handleSetDefault = async (config: ModelConfig) => {
    try {
      await setDefaultMutation.mutateAsync(config.id);
      toast.success(`已将 ${config.name} 设为默认模型`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '设置默认失败');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI 模型配置</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理诊断与对话的 LLM 出口；api_key 加密存储，界面上仅显示掩码
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          新增模型
        </button>
      </div>

      <ModelConfigTable
        configs={configs}
        isLoading={isLoading}
        testingId={testingId}
        onTest={handleTest}
        onSetDefault={handleSetDefault}
        onEdit={openEdit}
        onRequestDelete={setDeleting}
      />

      <ModelConfigFormDialog open={formOpen} editing={editing} onClose={() => setFormOpen(false)} />
      <ModelConfigDeleteDialog deleting={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}
