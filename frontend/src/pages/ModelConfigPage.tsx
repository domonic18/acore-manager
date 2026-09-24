import { FormEvent, useState } from 'react';
import {
  ModelConfig,
  PROVIDER_PRESETS,
} from '@/features/model-config/api/model-config.api';
import {
  useCreateModelConfig,
  useDeleteModelConfig,
  useModelConfigs,
  useSetDefaultModelConfig,
  useTestModelConfig,
  useUpdateModelConfig,
} from '@/features/model-config/hooks/useModelConfig';
import { Dialog } from '@/shared/components/Dialog';
import { toast } from '@/shared/utils/toast.util';
import { Eye, EyeOff, Pencil, PlayCircle, Plus, Star, Trash2 } from 'lucide-react';

const inputClass =
  'w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring';

interface FormState {
  name: string;
  provider: string;
  protocol: string;
  baseUrl: string;
  modelName: string;
  apiKey: string;
  temperature: string;
  maxTokens: string;
  isDefault: boolean;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  name: '',
  provider: 'zhipu',
  protocol: 'openai',
  baseUrl: PROVIDER_PRESETS[0].baseUrl,
  modelName: '',
  apiKey: '',
  temperature: '',
  maxTokens: '',
  isDefault: false,
  isActive: true,
};

function formFromConfig(config: ModelConfig): FormState {
  return {
    name: config.name,
    provider: config.provider,
    protocol: config.protocol,
    baseUrl: config.baseUrl,
    modelName: config.modelName,
    apiKey: '',
    temperature: config.temperature != null ? String(config.temperature) : '',
    maxTokens: config.maxTokens != null ? String(config.maxTokens) : '',
    isDefault: config.isDefault,
    isActive: config.isActive,
  };
}

export default function ModelConfigPage() {
  const { data: configs, isLoading } = useModelConfigs();
  const createMutation = useCreateModelConfig();
  const updateMutation = useUpdateModelConfig();
  const deleteMutation = useDeleteModelConfig();
  const setDefaultMutation = useSetDefaultModelConfig();
  const testMutation = useTestModelConfig();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ModelConfig | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleting, setDeleting] = useState<ModelConfig | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [keyVisible, setKeyVisible] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (config: ModelConfig) => {
    setEditing(config);
    setForm(formFromConfig(config));
    setModalOpen(true);
  };

  const handleProviderChange = (provider: string) => {
    const preset = PROVIDER_PRESETS.find((p) => p.value === provider);
    setForm((prev) => ({
      ...prev,
      provider,
      baseUrl: preset?.baseUrl ?? prev.baseUrl,
      protocol: preset?.protocol ?? prev.protocol,
    }));
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      provider: form.provider,
      protocol: form.protocol,
      baseUrl: form.baseUrl.trim(),
      modelName: form.modelName.trim(),
      apiKey: form.apiKey.trim() || undefined,
      temperature: form.temperature.trim() === '' ? null : Number(form.temperature),
      maxTokens: form.maxTokens.trim() === '' ? null : Number(form.maxTokens),
      isDefault: form.isDefault,
      isActive: form.isActive,
    };
    if (!payload.apiKey && !editing) {
      toast.error('新增配置必须填写 api_key');
      return;
    }
    try {
      if (editing) {
        await updateMutation.mutateAsync({ id: editing.id, payload });
        toast.success('配置已保存');
      } else {
        await createMutation.mutateAsync(payload);
        toast.success('配置已新增');
      }
      setModalOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    }
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

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
      toast.success(`已删除 ${deleting.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败');
    } finally {
      setDeleting(null);
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

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

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">名称</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">提供商 / 协议</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">模型</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Base URL</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">API Key</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">最近测试</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  加载中...
                </td>
              </tr>
            ) : (configs?.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  暂无模型配置，点击右上角"新增模型"创建；未配置默认模型前 AI 诊断不可用
                </td>
              </tr>
            ) : (
              configs?.map((config) => (
                <tr key={config.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{config.name}</span>
                      {config.isDefault && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs">
                          <Star className="w-3 h-3" />
                          默认
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {config.provider} / {config.protocol}
                  </td>
                  <td className="px-4 py-3">{config.modelName}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[220px] truncate" title={config.baseUrl}>
                    {config.baseUrl}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {config.apiKeyMasked}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        config.isActive ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {config.isActive ? '启用' : '停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {config.lastTestStatus == null ? (
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
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleTest(config)}
                        disabled={testingId === config.id}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-accent disabled:opacity-50"
                        title="测试连接"
                      >
                        <PlayCircle className="w-4 h-4" />
                      </button>
                      {!config.isDefault && (
                        <button
                          onClick={() => handleSetDefault(config)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-accent"
                          title="设为默认"
                        >
                          <Star className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(config)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-accent"
                        title="编辑"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleting(config)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-accent"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `编辑模型：${editing.name}` : '新增模型'}
      >
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">配置名 *</span>
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="如 glm-flash"
                required
                maxLength={100}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">提供商</span>
              <select
                className={inputClass}
                value={form.provider}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                {PROVIDER_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">协议</span>
              <select
                className={inputClass}
                value={form.protocol}
                onChange={(e) => setForm((p) => ({ ...p, protocol: e.target.value }))}
              >
                <option value="openai">OpenAI 兼容</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">模型名 *</span>
              <input
                className={inputClass}
                value={form.modelName}
                onChange={(e) => setForm((p) => ({ ...p, modelName: e.target.value }))}
                placeholder="如 glm-4.6"
                required
                maxLength={100}
              />
            </label>
          </div>
          <label className="space-y-1 block">
            <span className="text-xs text-muted-foreground">Base URL *</span>
            <input
              className={inputClass}
              value={form.baseUrl}
              onChange={(e) => setForm((p) => ({ ...p, baseUrl: e.target.value }))}
              placeholder="https://..."
              required
              maxLength={500}
            />
          </label>
          <label className="space-y-1 block">
            <span className="text-xs text-muted-foreground">
              API Key {editing ? '（留空保持原值）' : '*'}
            </span>
            {/* 不用 type=password：浏览器/系统会误判为登录密码弹强密码/保存气泡，Esc 关气泡时会误关对话框；
                用 CSS 圆点遮罩替代（Firefox 不支持该 CSS 时退化为明文显示，可用眼睛按钮配合） */}
            <div className="relative">
              <input
                className={`${inputClass} pr-10 font-mono`}
                type="text"
                style={{ WebkitTextSecurity: keyVisible ? 'none' : 'disc' } as React.CSSProperties}
                value={form.apiKey}
                onChange={(e) => setForm((p) => ({ ...p, apiKey: e.target.value }))}
                placeholder={editing ? '留空则不修改' : '粘贴 API Key'}
                required={!editing}
                maxLength={500}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setKeyVisible((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                title={keyVisible ? '隐藏' : '显示'}
              >
                {keyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Temperature</span>
              <input
                className={inputClass}
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={form.temperature}
                onChange={(e) => setForm((p) => ({ ...p, temperature: e.target.value }))}
                placeholder="默认"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Max Tokens</span>
              <input
                className={inputClass}
                type="number"
                min="1"
                value={form.maxTokens}
                onChange={(e) => setForm((p) => ({ ...p, maxTokens: e.target.value }))}
                placeholder="默认"
              />
            </label>
          </div>
          <div className="flex items-center gap-6 pt-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))}
              />
              设为默认（同时启用）
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
              />
              启用
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title="确认删除"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button
              onClick={() => setDeleting(null)}
              className="px-3 py-2 rounded-md border border-border text-sm hover:bg-accent"
            >
              取消
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 rounded-md bg-destructive text-white text-sm font-medium hover:bg-destructive/90 disabled:opacity-50"
            >
              {deleteMutation.isPending ? '删除中...' : '确认删除'}
            </button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          确认删除模型配置 <span className="font-medium text-foreground">{deleting?.name}</span>？
          {deleting?.isDefault && (
            <span className="block mt-1 text-red-600">
              该配置是当前默认模型，删除后自动提升首个启用配置为默认。
            </span>
          )}
        </p>
      </Dialog>
    </div>
  );
}
