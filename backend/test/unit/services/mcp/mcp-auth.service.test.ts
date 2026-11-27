import {
  apiKeyFingerprint,
  generateApiKeyPlain,
  maskApiKey,
  mcpAuthService,
  MCP_API_KEY_PREFIX,
  plainEquals,
} from '@/services/mcp/auth.service';
import { systemConfigService } from '@/services/system-config.service';
import { auditLogService } from '@/services/audit-log.service';

jest.mock('@/services/system-config.service', () => ({
  systemConfigService: {
    getSecretValue: jest.fn(),
    setSecretValue: jest.fn(),
    getSecretUpdatedAt: jest.fn(),
  },
}));

jest.mock('@/services/audit-log.service', () => ({
  auditLogService: { record: jest.fn() },
}));

const getSecretValue = systemConfigService.getSecretValue as jest.Mock;
const setSecretValue = systemConfigService.setSecretValue as jest.Mock;
const record = auditLogService.record as jest.Mock;

const OPERATOR = { operatorId: 7, operatorName: 'E2E_ADMIN' };

describe('API-KEY 生成与掩码', () => {
  it('key 带 acm_mcp_ 前缀且随机', () => {
    const a = generateApiKeyPlain();
    const b = generateApiKeyPlain();
    expect(a.startsWith(MCP_API_KEY_PREFIX)).toBe(true);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(MCP_API_KEY_PREFIX.length + 20);
  });

  it('掩码不泄露中段明文', () => {
    const plain = generateApiKeyPlain();
    const masked = maskApiKey(plain);
    expect(masked).not.toContain(plain);
    expect(masked.startsWith(plain.slice(0, 8))).toBe(true);
    expect(masked.endsWith(plain.slice(-4))).toBe(true);
  });

  it('指纹只暴露 sha256 前 8 位', () => {
    const plain = generateApiKeyPlain();
    const fingerprint = apiKeyFingerprint(plain);
    expect(fingerprint).toHaveLength(8);
    expect(plain).not.toContain(fingerprint);
  });
});

describe('plainEquals', () => {
  it('相同为 true，不同/空为 false', () => {
    const plain = generateApiKeyPlain();
    expect(plainEquals(plain, plain)).toBe(true);
    expect(plainEquals(plain, generateApiKeyPlain())).toBe(false);
    expect(plainEquals('', plain)).toBe(false);
    expect(plainEquals(plain, '')).toBe(false);
  });
});

describe('mcpAuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSecretValue.mockResolvedValue(null);
    setSecretValue.mockResolvedValue(undefined);
    (systemConfigService.getSecretUpdatedAt as jest.Mock).mockResolvedValue(new Date('2026-11-27T00:00:00Z'));
  });

  it('未配置时自动生成并落库', async () => {
    const view = await mcpAuthService.getApiKeyView();
    expect(view.configured).toBe(true);
    expect(view.masked).toBeTruthy();
    expect(setSecretValue).toHaveBeenCalledTimes(1);
    const [, plain] = setSecretValue.mock.calls[0];
    expect(String(plain).startsWith(MCP_API_KEY_PREFIX)).toBe(true);
  });

  it('已配置时只回掩码，不写库', async () => {
    getSecretValue.mockResolvedValue('acm_mcp_existingkeyvalue1234');
    const view = await mcpAuthService.getApiKeyView();
    expect(view.configured).toBe(true);
    expect(view.masked).toBe('acm_mcp_********1234');
    expect(setSecretValue).not.toHaveBeenCalled();
  });

  it('校验：命中返回 true，错误 key 与未配置返回 false', async () => {
    getSecretValue.mockResolvedValue('acm_mcp_existingkeyvalue1234');
    await expect(mcpAuthService.verifyApiKey('acm_mcp_existingkeyvalue1234')).resolves.toBe(true);
    await expect(mcpAuthService.verifyApiKey('acm_mcp_wrong')).resolves.toBe(false);
    getSecretValue.mockResolvedValue(null);
    await expect(mcpAuthService.verifyApiKey('acm_mcp_existingkeyvalue1234')).resolves.toBe(false);
  });

  it('取明文记审计', async () => {
    getSecretValue.mockResolvedValue('acm_mcp_existingkeyvalue1234');
    const plain = await mcpAuthService.revealApiKey(OPERATOR);
    expect(plain).toBe('acm_mcp_existingkeyvalue1234');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'mcp.token.reveal', operatorId: 7, operatorName: 'E2E_ADMIN' }),
    );
  });

  it('轮换生成新 key 并记审计（旧 key 指纹留痕）', async () => {
    getSecretValue.mockResolvedValue('acm_mcp_existingkeyvalue1234');
    const plain = await mcpAuthService.rotateApiKey(OPERATOR);
    expect(plain.startsWith(MCP_API_KEY_PREFIX)).toBe(true);
    expect(plain).not.toBe('acm_mcp_existingkeyvalue1234');
    expect(setSecretValue).toHaveBeenCalledWith(
      'mcp_api_key',
      plain,
      'E2E_ADMIN',
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'mcp.token.rotate',
        details: expect.stringContaining(apiKeyFingerprint('acm_mcp_existingkeyvalue1234')),
      }),
    );
  });
});
