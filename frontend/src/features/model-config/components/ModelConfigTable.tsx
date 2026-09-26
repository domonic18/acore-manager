import { Pencil, PlayCircle, Star, Trash2 } from 'lucide-react';
import { ModelConfig } from '@/features/model-config/api/model-config.api';
import { SimpleTable, type SimpleColumn } from '@/shared/components/SimpleTable';

interface ModelConfigTableProps {
  configs?: ModelConfig[];
  isLoading?: boolean;
  testingId: number | null;
  onTest: (config: ModelConfig) => void;
  onSetDefault: (config: ModelConfig) => void;
  onEdit: (config: ModelConfig) => void;
  onRequestDelete: (config: ModelConfig) => void;
}

export function ModelConfigTable({
  configs,
  isLoading,
  testingId,
  onTest,
  onSetDefault,
  onEdit,
  onRequestDelete,
}: ModelConfigTableProps) {
  const columns: SimpleColumn<ModelConfig>[] = [
    {
      key: 'name',
      header: '名称',
      render: (config) => (
        <div className="flex items-center gap-1.5">
          <span className="font-medium">{config.name}</span>
          {config.isDefault && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs">
              <Star className="w-3 h-3" />
              默认
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'provider',
      header: '提供商 / 协议',
      render: (config) => (
        <span className="text-muted-foreground">
          {config.provider} / {config.protocol}
        </span>
      ),
    },
    { key: 'modelName', header: '模型', render: (config) => config.modelName },
    {
      key: 'baseUrl',
      header: 'Base URL',
      render: (config) => (
        <span className="text-muted-foreground max-w-[220px] truncate block" title={config.baseUrl}>
          {config.baseUrl}
        </span>
      ),
    },
    {
      key: 'apiKeyMasked',
      header: 'API Key',
      render: (config) => (
        <span className="font-mono text-xs text-muted-foreground">{config.apiKeyMasked}</span>
      ),
    },
    {
      key: 'isActive',
      header: '状态',
      render: (config) => (
        <span
          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
            config.isActive ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'
          }`}
        >
          {config.isActive ? '启用' : '停用'}
        </span>
      ),
    },
    {
      key: 'lastTestStatus',
      header: '最近测试',
      render: (config) =>
        config.lastTestStatus == null ? (
          <span className="text-muted-foreground">未测试</span>
        ) : (
          <div className="flex flex-col">
            <span
              className={`inline-flex px-2 py-0.5 rounded text-xs font-medium w-fit ${
                config.lastTestStatus === 'ok'
                  ? 'bg-green-500/10 text-green-600'
                  : 'bg-red-500/10 text-red-600'
              }`}
            >
              {config.lastTestStatus === 'ok' ? '成功' : '失败'}
            </span>
            {config.lastTestedAt && (
              <span className="text-xs text-muted-foreground mt-0.5">
                {new Date(config.lastTestedAt).toLocaleString('zh-CN')}
              </span>
            )}
          </div>
        ),
    },
    {
      key: 'actions',
      header: '操作',
      render: (config) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onTest(config)}
            disabled={testingId === config.id}
            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-accent disabled:opacity-50"
            title="测试连接"
          >
            <PlayCircle className="w-4 h-4" />
          </button>
          {!config.isDefault && (
            <button
              onClick={() => onSetDefault(config)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-accent"
              title="设为默认"
            >
              <Star className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onEdit(config)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-accent"
            title="编辑"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRequestDelete(config)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-accent"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <SimpleTable
      columns={columns}
      rows={configs ?? []}
      rowKey={(config) => config.id}
      loading={isLoading}
      emptyText='暂无模型配置，点击右上角"新增模型"创建；未配置默认模型前 AI 诊断不可用'
    />
  );
}
