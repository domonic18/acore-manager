import { acmDataSource } from '../../src/config/database';
import { AiModelConfig } from '../../src/entities/acm/ai-model-config.entity';
import { decryptToken } from '../../src/shared/utils/aes.util';

export interface ResolvedLlmConfig {
  id: number;
  name: string;
  provider: string;
  protocol: string;
  baseUrl: string;
  modelName: string;
  apiKey: string;
  temperature: number | null;
  maxTokens: number | null;
}

// 生产 resolve 链路原型：acm.ai_model_config 默认行 → AES 解密 → 构建 ChatOpenAI 参数。
// 无默认可用配置时明确报错（无环境变量兜底，参考 ai-invest-assisstant LLMConfigNotConfiguredError）。
export async function resolveDefaultLlmConfig(): Promise<ResolvedLlmConfig> {
  if (!acmDataSource.isInitialized) await acmDataSource.initialize();
  const repo = acmDataSource.getRepository(AiModelConfig);
  const row = await repo.findOneBy({ isDefault: true, isActive: true });
  if (!row) {
    throw new Error('未配置默认 LLM 模型，请管理员在后台新增并设为默认 / no default LLM model configured');
  }
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    protocol: row.protocol,
    baseUrl: row.baseUrl,
    modelName: row.modelName,
    apiKey: decryptToken(row.apiKeyEncrypted),
    temperature: row.temperature,
    maxTokens: row.maxTokens,
  };
}
