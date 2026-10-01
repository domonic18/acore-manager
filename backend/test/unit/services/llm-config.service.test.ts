jest.mock('@/config/database', () => ({
  acmDataSource: { getRepository: jest.fn() },
}));
jest.mock('@/services/audit-log.service', () => ({
  auditLogService: { record: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/shared/utils/aes.util', () => ({
  encryptToken: jest.fn((v: string) => `enc:${v}`),
  decryptToken: jest.fn((v: string) => v.replace(/^enc:/, '')),
  maskToken: jest.fn((v: string) => (v ? `***${v.slice(-4)}` : '')),
}));

import { acmDataSource } from '@/config/database';
import { auditLogService } from '@/services/audit-log.service';
import { llmConfigService } from '@/services/ai/llm-config.service';

const getRepository = acmDataSource.getRepository as jest.Mock;
const auditRecord = auditLogService.record as jest.Mock;

function repoMock() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findOneBy: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((partial: Record<string, unknown>) => ({ ...partial })),
    save: jest.fn().mockImplementation(async (row: Record<string, unknown>) => ({ id: 7, ...row })),
    update: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
  };
}

const BASE_ROW = {
  id: 7,
  name: 'kimi',
  provider: 'moonshot',
  protocol: 'anthropic',
  baseUrl: 'https://api.example.com',
  modelName: 'kimi-for-coding',
  apiKeyEncrypted: 'enc:k',
  temperature: null,
  maxTokens: null,
  isDefault: true,
  isActive: true,
  lastTestedAt: null,
  lastTestStatus: null,
  lastTestError: null,
  createdBy: 'gm',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
};

beforeEach(() => {
  jest.clearAllMocks();
  getRepository.mockReturnValue(repoMock());
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('llm-config.service create/update', () => {
  it('requires api_key on create and rejects with 400', async () => {
    await expect(
      llmConfigService.create({ name: 'a', provider: 'p', protocol: 'anthropic', baseUrl: 'u', modelName: 'm' }, 1, 'gm'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('creates encrypted row; default creation clears other defaults', async () => {
    const repo = repoMock();
    repo.findOneBy.mockResolvedValue(null); // 名称可用
    getRepository.mockReturnValue(repo);

    const view = await llmConfigService.create(
      { name: 'kimi', provider: 'moonshot', protocol: 'anthropic', baseUrl: 'u', modelName: 'm', apiKey: 'k', isDefault: true },
      1,
      'gm',
    );

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ apiKeyEncrypted: 'enc:k', isDefault: true, isActive: true }));
    expect(repo.update).toHaveBeenCalledWith({ isDefault: true }, { isDefault: false });
    expect(view.apiKeyMasked).toBe('***k');
    expect(auditRecord).toHaveBeenCalledWith(expect.objectContaining({ operation: 'ai.model-config.create' }));
  });

  it('applies simple fields via table and keeps api_key when left empty (write-only)', async () => {
    const repo = repoMock();
    repo.findOneBy.mockResolvedValueOnce({ ...BASE_ROW }).mockResolvedValueOnce(null); // 行查询 → 名称查重
    getRepository.mockReturnValue(repo);

    await llmConfigService.update(7, { name: 'kimi-2', temperature: 0.5, apiKey: '' }, 1, 'gm');

    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'kimi-2', temperature: 0.5, apiKeyEncrypted: 'enc:k' }));
    expect(auditRecord).toHaveBeenCalledWith(expect.objectContaining({ operation: 'ai.model-config.update', details: 'api_key kept' }));
  });

  it('isDefault=true clears other defaults and force-activates the row', async () => {
    const repo = repoMock();
    repo.findOneBy.mockResolvedValue({ ...BASE_ROW, isDefault: false, isActive: false });
    getRepository.mockReturnValue(repo);

    await llmConfigService.update(7, { isDefault: true }, 1, 'gm');

    expect(repo.update).toHaveBeenCalledWith({ isDefault: true }, { isDefault: false });
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isDefault: true, isActive: true }));
  });

  it('rejects duplicate names with 409', async () => {
    const repo = repoMock();
    repo.findOneBy.mockResolvedValueOnce({ ...BASE_ROW }).mockResolvedValueOnce({ ...BASE_ROW, id: 8 }); // 名称已被占用
    getRepository.mockReturnValue(repo);

    await expect(llmConfigService.update(7, { name: 'other' }, 1, 'gm')).rejects.toMatchObject({ status: 409 });
  });
});

describe('llm-config.service remove/setDefault/resolveDefault', () => {
  it('promotes the first active row after removing the default', async () => {
    const repo = repoMock();
    repo.findOneBy.mockResolvedValue({ ...BASE_ROW });
    repo.findOne.mockResolvedValue({ ...BASE_ROW, id: 8, name: 'next' });
    getRepository.mockReturnValue(repo);

    await llmConfigService.remove(7, 1, 'gm');

    expect(repo.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 8, isDefault: true }));
    expect(auditRecord).toHaveBeenCalledWith(expect.objectContaining({ operation: 'ai.model-config.promote', target: 'next' }));
  });

  it('throws 500 on resolveDefault when no active default exists', async () => {
    await expect(llmConfigService.resolveDefault()).rejects.toMatchObject({ status: 500 });
  });

  it('resolveDefault returns decrypted api key', async () => {
    const repo = repoMock();
    repo.findOneBy.mockResolvedValue({ ...BASE_ROW });
    getRepository.mockReturnValue(repo);

    const cfg = await llmConfigService.resolveDefault();
    expect(cfg.apiKey).toBe('k');
    expect(cfg.modelName).toBe('kimi-for-coding');
  });
});

describe('llm-config.service testConnection', () => {
  it('pings Anthropic Messages endpoint with decrypted key and records ok', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    const repo = repoMock();
    repo.findOneBy.mockResolvedValue({ ...BASE_ROW });
    getRepository.mockReturnValue(repo);

    const result = await llmConfigService.testConnection(7, 1, 'gm');

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/v1/messages', expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'k' }) }));
    expect(repo.update).toHaveBeenCalledWith(7, expect.objectContaining({ lastTestStatus: 'ok' }));
  });

  it('pings OpenAI-compatible chat/completions endpoint with Bearer auth', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    const repo = repoMock();
    repo.findOneBy.mockResolvedValue({ ...BASE_ROW, protocol: 'openai' });
    getRepository.mockReturnValue(repo);

    await llmConfigService.testConnection(7, 1, 'gm');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/chat/completions',
      expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer k' }) }),
    );
  });

  it('records failure with HTTP status when the ping is rejected', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401, text: async () => 'bad key' } as unknown as Response);
    const repo = repoMock();
    repo.findOneBy.mockResolvedValue({ ...BASE_ROW });
    getRepository.mockReturnValue(repo);

    const result = await llmConfigService.testConnection(7, 1, 'gm');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('HTTP 401');
    expect(repo.update).toHaveBeenCalledWith(7, expect.objectContaining({ lastTestStatus: 'failed', lastTestError: expect.stringContaining('HTTP 401') }));
  });
});
