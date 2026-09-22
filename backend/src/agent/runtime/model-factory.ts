import { createHash } from 'crypto';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';

// 按出口协议分派模型客户端（T0.3 结论：anthropic 协议端点 ChatOpenAI 打不通）。
// 配置解析属业务侧（services/ai/llm-config.service），本模块只消费纯数据。
export interface ResolvedModelConfig {
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

// 返回类型为 ChatOpenAI | ChatAnthropic 推断联合——刻意不标注跨包的 BaseLanguageModel，
// 规避 @langchain/* 双声明身份在类型检查下的结构性冲突
export function buildModelClient(cfg: ResolvedModelConfig) {
  const common = {
    temperature: cfg.temperature ?? undefined,
    maxTokens: cfg.maxTokens ?? undefined,
  };
  if (cfg.protocol === 'anthropic') {
    return new ChatAnthropic({
      model: cfg.modelName,
      apiKey: cfg.apiKey,
      anthropicApiUrl: cfg.baseUrl.replace(/\/+$/, ''),
      ...common,
    });
  }
  return new ChatOpenAI({
    model: cfg.modelName,
    apiKey: cfg.apiKey,
    configuration: { baseURL: cfg.baseUrl },
    ...common,
  });
}

// 出口指纹（arch 3.2.2）：协议/地址/模型/密钥任一变更即视为不同实例
export function modelFingerprint(cfg: ResolvedModelConfig): string {
  const keyHash = createHash('sha256').update(cfg.apiKey).digest('hex');
  return createHash('sha256')
    .update([cfg.protocol, cfg.baseUrl, cfg.modelName, keyHash].join('|'))
    .digest('hex');
}
