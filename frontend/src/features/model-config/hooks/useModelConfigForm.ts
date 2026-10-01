import { useEffect, useState } from 'react';
import { ModelConfig, PROVIDER_PRESETS } from '@/features/model-config/api/model-config.api';

export interface FormState {
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

// api_key 留空 = undefined（update 时保持原值，create 时由调用方拦截报错）
export function buildPayload(form: FormState) {
  return {
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
}

// 表单生命周期：open 时按 editing（新增=null）重置；提供商切换联动预设 baseUrl/protocol
export function useModelConfigForm(editing: ModelConfig | null, open: boolean) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => {
    if (open) setForm(editing ? formFromConfig(editing) : EMPTY_FORM);
  }, [open, editing]);

  const setField = (key: keyof FormState, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setProvider = (provider: string) => {
    const preset = PROVIDER_PRESETS.find((p) => p.value === provider);
    setForm((prev) => ({
      ...prev,
      provider,
      baseUrl: preset?.baseUrl ?? prev.baseUrl,
      protocol: preset?.protocol ?? prev.protocol,
    }));
  };

  return { form, setField, setProvider };
}
