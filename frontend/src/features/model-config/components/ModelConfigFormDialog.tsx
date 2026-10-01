import { FormEvent, useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { ModelConfig, PROVIDER_PRESETS } from '@/features/model-config/api/model-config.api';
import { useCreateModelConfig, useUpdateModelConfig } from '@/features/model-config/hooks/useModelConfig';
import { buildPayload, useModelConfigForm } from '@/features/model-config/hooks/useModelConfigForm';
import { Dialog } from '@/shared/components/Dialog';
import { toast } from '@/shared/utils/toast.util';

const inputClass =
  'w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring';

interface ModelConfigFormDialogProps {
  open: boolean;
  editing: ModelConfig | null;
  onClose: () => void;
}

export function ModelConfigFormDialog({ open, editing, onClose }: ModelConfigFormDialogProps) {
  const { form, setField, setProvider } = useModelConfigForm(editing, open);
  const createMutation = useCreateModelConfig();
  const updateMutation = useUpdateModelConfig();
  const [keyVisible, setKeyVisible] = useState(false);
  const saving = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (open) setKeyVisible(false);
  }, [open]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const payload = buildPayload(form);
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
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={editing ? `编辑模型：${editing.name}` : '新增模型'}>
      <form onSubmit={handleSave} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">配置名 *</span>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
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
              onChange={(e) => setProvider(e.target.value)}
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
              onChange={(e) => setField('protocol', e.target.value)}
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
              onChange={(e) => setField('modelName', e.target.value)}
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
            onChange={(e) => setField('baseUrl', e.target.value)}
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
              onChange={(e) => setField('apiKey', e.target.value)}
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
              onChange={(e) => setField('temperature', e.target.value)}
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
              onChange={(e) => setField('maxTokens', e.target.value)}
              placeholder="默认"
            />
          </label>
        </div>
        <div className="flex items-center gap-6 pt-1">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setField('isDefault', e.target.checked)}
            />
            设为默认（同时启用）
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setField('isActive', e.target.checked)}
            />
            启用
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
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
  );
}
