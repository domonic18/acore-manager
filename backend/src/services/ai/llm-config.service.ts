import { acmDataSource } from '@/config/database';
import { AiModelConfig } from '@/entities/acm/ai-model-config.entity';
import { auditLogService } from '@/services/audit-log.service';
import { decryptToken, encryptToken, maskToken } from '@/shared/utils/aes.util';
import { ServiceError } from '@/shared/errors/service-error';

// T2.2 最小切片（M0 提前实施）：模型出口配置管理。
// 行为规则参考 ai-invest-assisstant llm_config_service：
//   设默认清除其他默认行；删除默认行自动提升首个 active 行；
//   api_key 编辑留空 = 保留原值（write-only）；接口回显仅掩码；无环境变量兜底。

export { ServiceError };

export interface ModelConfigView {
  id: number;
  name: string;
  provider: string;
  protocol: string;
  baseUrl: string;
  modelName: string;
  apiKeyMasked: string;
  temperature: number | null;
  maxTokens: number | null;
  isDefault: boolean;
  isActive: boolean;
  lastTestedAt: Date | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModelConfigInput {
  name: string;
  provider: string;
  protocol: string;
  baseUrl: string;
  modelName: string;
  apiKey?: string;
  temperature?: number | null;
  maxTokens?: number | null;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface TestConnectionResult {
  ok: boolean;
  latencyMs: number;
  error: string | null;
}

// update 可表驱动直赋的透传字段；特例单独处理：apiKey（write-only，留空保留原值）、
// isDefault（需清除其他默认行并强制激活）
const SIMPLE_FIELDS = ['name', 'provider', 'protocol', 'baseUrl', 'modelName', 'temperature', 'maxTokens', 'isActive'] as const;
type SimpleField = (typeof SIMPLE_FIELDS)[number];

function toView(row: AiModelConfig): ModelConfigView {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    protocol: row.protocol,
    baseUrl: row.baseUrl,
    modelName: row.modelName,
    apiKeyMasked: maskToken(decryptToken(row.apiKeyEncrypted)),
    temperature: row.temperature != null ? Number(row.temperature) : null,
    maxTokens: row.maxTokens ?? null,
    isDefault: Boolean(row.isDefault),
    isActive: Boolean(row.isActive),
    lastTestedAt: row.lastTestedAt ?? null,
    lastTestStatus: row.lastTestStatus ?? null,
    lastTestError: row.lastTestError ?? null,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

class LlmConfigService {
  private get repo() {
    return acmDataSource.getRepository(AiModelConfig);
  }

  async list(): Promise<ModelConfigView[]> {
    const rows = await this.repo.find({ order: { isDefault: 'DESC', id: 'ASC' } });
    return rows.map(toView);
  }

  async create(input: ModelConfigInput, operatorId: number, operatorName: string): Promise<ModelConfigView> {
    if (!input.apiKey) throw new ServiceError('新增配置必须提供 api_key / api_key is required', 400);
    await this.ensureNameAvailable(input.name);

    const row = this.repo.create({
      name: input.name,
      provider: input.provider,
      protocol: input.protocol,
      baseUrl: input.baseUrl,
      modelName: input.modelName,
      apiKeyEncrypted: encryptToken(input.apiKey),
      temperature: input.temperature ?? null,
      maxTokens: input.maxTokens ?? null,
      isDefault: input.isDefault ?? false,
      isActive: input.isDefault ? true : (input.isActive ?? true),
      createdBy: operatorName || String(operatorId),
    });
    if (row.isDefault) await this.repo.update({ isDefault: true }, { isDefault: false });

    const saved = await this.repo.save(row);
    await this.audit(operatorId, operatorName, 'ai.model-config.create', saved.name, `model=${saved.modelName}`);
    return toView(saved);
  }

  async update(id: number, input: Partial<ModelConfigInput>, operatorId: number, operatorName: string): Promise<ModelConfigView> {
    const row = await this.repo.findOneBy({ id });
    if (!row) throw new ServiceError('配置不存在 / model config not found', 404);
    if (input.name && input.name !== row.name) await this.ensureNameAvailable(input.name, id);

    for (const field of SIMPLE_FIELDS) {
      const value = input[field];
      if (value !== undefined) (row as Record<SimpleField, unknown>)[field] = value;
    }
    if (input.apiKey) row.apiKeyEncrypted = encryptToken(input.apiKey);
    if (input.isDefault === true) {
      await this.repo.update({ isDefault: true }, { isDefault: false });
      row.isDefault = true;
      row.isActive = true;
    }

    const saved = await this.repo.save(row);
    await this.audit(operatorId, operatorName, 'ai.model-config.update', saved.name, input.apiKey ? 'api_key rotated' : 'api_key kept');
    return toView(saved);
  }

  async remove(id: number, operatorId: number, operatorName: string): Promise<void> {
    const row = await this.repo.findOneBy({ id });
    if (!row) throw new ServiceError('配置不存在 / model config not found', 404);
    await this.repo.remove(row);

    if (row.isDefault) {
      const next = await this.repo.findOne({ where: { isActive: true }, order: { id: 'ASC' } });
      if (next) {
        next.isDefault = true;
        await this.repo.save(next);
        await this.audit(operatorId, operatorName, 'ai.model-config.promote', next.name, 'auto-promoted after default removed');
      }
    }
    await this.audit(operatorId, operatorName, 'ai.model-config.delete', row.name, `model=${row.modelName}`);
  }

  async setDefault(id: number, operatorId: number, operatorName: string): Promise<ModelConfigView> {
    const row = await this.repo.findOneBy({ id });
    if (!row) throw new ServiceError('配置不存在 / model config not found', 404);
    await this.repo.update({ isDefault: true }, { isDefault: false });
    row.isDefault = true;
    row.isActive = true;
    const saved = await this.repo.save(row);
    await this.audit(operatorId, operatorName, 'ai.model-config.set-default', saved.name, `model=${saved.modelName}`);
    return toView(saved);
  }

  async testConnection(id: number, operatorId: number, operatorName: string): Promise<TestConnectionResult> {
    const row = await this.repo.findOneBy({ id });
    if (!row) throw new ServiceError('配置不存在 / model config not found', 404);

    const apiKey = decryptToken(row.apiKeyEncrypted);
    const startedAt = Date.now();
    let ok = false;
    let error: string | null = null;
    try {
      if (row.protocol === 'anthropic') await this.pingAnthropic(row.baseUrl, apiKey, row.modelName);
      else await this.pingOpenAI(row.baseUrl, apiKey, row.modelName);
      ok = true;
    } catch (err) {
      error = (err as Error).message ?? String(err);
    }

    const latencyMs = Date.now() - startedAt;
    await this.repo.update(row.id, {
      lastTestedAt: new Date(),
      lastTestStatus: ok ? 'ok' : 'failed',
      lastTestError: error,
    });
    await this.audit(operatorId, operatorName, 'ai.model-config.test', row.name, ok ? `ok ${latencyMs}ms` : `failed: ${error?.slice(0, 120)}`);
    return { ok, latencyMs, error };
  }

  // Anthropic Messages API 探活：1 token 的 ping 请求，HTTP 非 2xx 即失败（响应体截断 200 字符定位）
  private async pingAnthropic(baseUrl: string, apiKey: string, modelName: string): Promise<void> {
    const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: modelName, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  }

  private async pingOpenAI(baseUrl: string, apiKey: string, modelName: string): Promise<void> {
    const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: modelName, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  }

  async resolveDefault(): Promise<{ id: number; name: string; provider: string; protocol: string; baseUrl: string; modelName: string; apiKey: string; temperature: number | null; maxTokens: number | null }> {
    const row = await this.repo.findOneBy({ isDefault: true, isActive: true });
    if (!row) throw new ServiceError('未配置默认 LLM 模型，请管理员在后台新增并设为默认 / no default LLM model configured', 500);
    return {
      id: row.id,
      name: row.name,
      provider: row.provider,
      protocol: row.protocol,
      baseUrl: row.baseUrl,
      modelName: row.modelName,
      apiKey: decryptToken(row.apiKeyEncrypted),
      temperature: row.temperature != null ? Number(row.temperature) : null,
      maxTokens: row.maxTokens ?? null,
    };
  }

  private async ensureNameAvailable(name: string, excludeId?: number): Promise<void> {
    const existing = await this.repo.findOneBy({ name });
    if (existing && existing.id !== excludeId) {
      throw new ServiceError(`配置名已存在 / config name already exists: ${name}`, 409);
    }
  }

  private async audit(operatorId: number, operatorName: string, operation: string, target: string, details: string): Promise<void> {
    await auditLogService.record({ operatorId, operatorName, operation, target, details });
  }
}

export const llmConfigService = new LlmConfigService();
