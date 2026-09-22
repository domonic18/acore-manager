import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { buildModelClient, modelFingerprint, ResolvedModelConfig } from '@/agent/runtime/model-factory';

function cfg(overrides: Partial<ResolvedModelConfig> = {}): ResolvedModelConfig {
  return {
    id: 1,
    name: 'glm',
    provider: 'zhipu',
    protocol: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    modelName: 'glm-4.7-flash',
    apiKey: 'test-key',
    temperature: null,
    maxTokens: null,
    ...overrides,
  };
}

describe('model-factory', () => {
  it('dispatches ChatOpenAI for openai protocol', () => {
    expect(buildModelClient(cfg())).toBeInstanceOf(ChatOpenAI);
  });

  it('dispatches ChatAnthropic for anthropic protocol', () => {
    expect(buildModelClient(cfg({ protocol: 'anthropic' }))).toBeInstanceOf(ChatAnthropic);
  });

  it('strips trailing slashes from anthropic baseUrl', () => {
    const client = buildModelClient(cfg({ protocol: 'anthropic', baseUrl: 'https://api.example.com/' })) as unknown as { apiUrl?: string };
    expect(client.apiUrl).toBe('https://api.example.com');
  });

  it('fingerprint is stable per config and sensitive to protocol/model/key', () => {
    const base = modelFingerprint(cfg());
    expect(modelFingerprint(cfg())).toBe(base);
    expect(modelFingerprint(cfg({ protocol: 'anthropic' }))).not.toBe(base);
    expect(modelFingerprint(cfg({ modelName: 'other' }))).not.toBe(base);
    expect(modelFingerprint(cfg({ apiKey: 'another-key' }))).not.toBe(base);
  });
});
