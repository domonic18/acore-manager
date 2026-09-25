jest.mock('@/config/env', () => ({
  env: {
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
    FEISHU_WEBHOOK_URL: 'https://env.feishu.example/hook',
    FEISHU_WEBHOOK_SECRET: 'env-secret',
    ACM_WEB_BASE_URL: 'https://env-web.example',
    AI_DAILY_TOKEN_BUDGET: 5_000_000,
    AI_AGENT_CACHE_SIZE: 4,
    AI_TOOL_CALL_BUDGET: 20,
    AI_TOOL_TIMEOUT_MS: 5000,
    LOGIN_BRUTE_FORCE_ENABLED: true,
    LOGIN_MAX_ATTEMPTS: 5,
    LOGIN_LOCKOUT_MINUTES: 15,
    LOGIN_CAPTCHA_ENABLED: false,
    LOGIN_CAPTCHA_TTL_SECONDS: 300,
  },
  soapConn: { host: '10.0.0.5', port: 7878, user: 'envuser', pass: 'envpass' },
}));
jest.mock('@/config/database', () => ({
  acmDataSource: { getRepository: jest.fn() },
}));
jest.mock('@/services/audit-log.service', () => ({
  auditLogService: { record: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/services/ai/llm-config.service', () => ({
  ServiceError: class ServiceError extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
}));
jest.mock('@/shared/utils/aes.util', () => ({
  encryptToken: jest.fn((v: string) => `enc:${v}`),
  decryptToken: jest.fn((v: string) => v.replace(/^enc:/, '')),
  maskToken: jest.fn((v: string) => (v ? `***${v.slice(-4)}` : '')),
}));

import { acmDataSource } from '@/config/database';
import { soapConn } from '@/config/env';
import { readDefaultRealm, DEFAULT_REALM_FALLBACK, SYSTEM_CONFIG_KEYS } from '@/config/system-config.reader';
import { auditLogService } from '@/services/audit-log.service';
import { systemConfigService } from '@/services/system-config.service';

const getRepository = acmDataSource.getRepository as jest.Mock;
const upsert = jest.fn().mockResolvedValue(undefined);
const findOne = jest.fn().mockResolvedValue(null);
const find = jest.fn().mockResolvedValue([]);
const record = auditLogService.record as jest.Mock;

function row(configKey: string, configValue: string, isSecret = false) {
  return { configKey, configValue, isSecret };
}

beforeEach(() => {
  jest.clearAllMocks();
  getRepository.mockReturnValue({ find, findOne, upsert });
  find.mockResolvedValue([]);
  findOne.mockResolvedValue(null);
});

describe('system-config.reader', () => {
  it('default_realm 缺失时回落 DEFAULT_REALM_FALLBACK', async () => {
    await expect(readDefaultRealm()).resolves.toBe(DEFAULT_REALM_FALLBACK);
  });

  it('default_realm 已配置时读库值（secret 行解密）', async () => {
    find.mockResolvedValue([row(SYSTEM_CONFIG_KEYS.defaultRealm, 'enc:realm9', true)]);
    await expect(readDefaultRealm()).resolves.toBe('realm9');
  });
});

describe('getSoapConn', () => {
  it('DB 四项齐全时使用数据库配置', async () => {
    find.mockResolvedValue([
      row(SYSTEM_CONFIG_KEYS.soapHost, 'db.host'),
      row(SYSTEM_CONFIG_KEYS.soapPort, '7878'),
      row(SYSTEM_CONFIG_KEYS.soapUsername, 'dbuser'),
      row(SYSTEM_CONFIG_KEYS.soapPassword, 'enc:dbpass', true),
    ]);
    await expect(systemConfigService.getSoapConn()).resolves.toEqual({
      host: 'db.host',
      port: 7878,
      user: 'dbuser',
      pass: 'dbpass',
      source: 'db',
    });
  });

  it('任一缺失时整条回落环境变量', async () => {
    find.mockResolvedValue([
      row(SYSTEM_CONFIG_KEYS.soapHost, 'db.host'),
      row(SYSTEM_CONFIG_KEYS.soapPort, '7878'),
      // 缺 username / password
    ]);
    await expect(systemConfigService.getSoapConn()).resolves.toEqual({
      host: soapConn.host,
      port: soapConn.port,
      user: soapConn.user,
      pass: soapConn.pass,
      source: 'env',
    });
  });
});

describe('getView', () => {
  it('env 回落时密码掩码为 null', async () => {
    const view = await systemConfigService.getView();
    expect(view.defaultRealm).toBe(DEFAULT_REALM_FALLBACK);
    expect(view.soap.source).toBe('env');
    expect(view.soap.passwordMasked).toBeNull();
    expect(view.updatedAt).toBeNull();
  });

  it('DB 配置时返回掩码密码与更新时间', async () => {
    const configRows = [
      row(SYSTEM_CONFIG_KEYS.defaultRealm, 'realm2'),
      row(SYSTEM_CONFIG_KEYS.soapHost, 'db.host'),
      row(SYSTEM_CONFIG_KEYS.soapPort, '7878'),
      row(SYSTEM_CONFIG_KEYS.soapUsername, 'dbuser'),
      row(SYSTEM_CONFIG_KEYS.soapPassword, 'enc:dbpass1234', true),
    ];
    find.mockImplementation((opts?: { take?: number }) =>
      opts?.take === 1 ? [{ updatedAt: new Date('2026-09-25T00:00:00Z') }] : configRows,
    );
    const view = await systemConfigService.getView();
    expect(view.defaultRealm).toBe('realm2');
    expect(view.soap).toMatchObject({ host: 'db.host', port: 7878, username: 'dbuser', source: 'db' });
    expect(view.soap.passwordMasked).toBe('***1234');
    expect(view.updatedAt).toBe('2026-09-25T00:00:00.000Z');
  });
});

describe('update', () => {
  it('密码留空不覆盖原值', async () => {
    await systemConfigService.update(
      { defaultRealm: 'realm2', soap: { host: 'h', port: 7878, username: 'u', password: '' } },
      1,
      'gm',
    );
    const keys = upsert.mock.calls.map((c) => c[0].configKey);
    expect(keys).toEqual([
      SYSTEM_CONFIG_KEYS.defaultRealm,
      SYSTEM_CONFIG_KEYS.soapHost,
      SYSTEM_CONFIG_KEYS.soapPort,
      SYSTEM_CONFIG_KEYS.soapUsername,
    ]);
  });

  it('密码提供时加密写库并标记 secret', async () => {
    await systemConfigService.update({ soap: { password: 'plain-pass' } }, 1, 'gm');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        configKey: SYSTEM_CONFIG_KEYS.soapPassword,
        configValue: 'enc:plain-pass',
        isSecret: true,
      }),
      { conflictPaths: ['configKey'] },
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'system-config.update',
        target: SYSTEM_CONFIG_KEYS.soapPassword,
      }),
    );
  });

  it('非法 realm 抛 400', async () => {
    await expect(systemConfigService.update({ defaultRealm: 'a' }, 1, 'gm')).rejects.toMatchObject({ status: 400 });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('非法端口抛 400', async () => {
    await expect(systemConfigService.update({ soap: { port: 70000 } }, 1, 'gm')).rejects.toMatchObject({
      status: 400,
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('无变更时不写审计', async () => {
    await systemConfigService.update({}, 1, 'gm');
    expect(upsert).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});

describe('update: feishu', () => {
  it('webhookUrl 非空 upsert，空串删行回落', async () => {
    await systemConfigService.update({ feishu: { webhookUrl: 'https://open.feishu.cn/hook/x' } }, 1, 'gm');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ configKey: SYSTEM_CONFIG_KEYS.feishuWebhookUrl, configValue: 'https://open.feishu.cn/hook/x' }),
      { conflictPaths: ['configKey'] },
    );

    const del = jest.fn().mockResolvedValue(undefined);
    getRepository.mockReturnValue({ find, findOne, upsert, delete: del });
    await systemConfigService.update({ feishu: { webhookUrl: '' } }, 1, 'gm');
    expect(del).toHaveBeenCalledWith(SYSTEM_CONFIG_KEYS.feishuWebhookUrl);
  });

  it('webhookSecret 加密写库，webBaseUrl 需 http(s) 前缀', async () => {
    await systemConfigService.update({ feishu: { webhookSecret: 's3cret', webBaseUrl: 'https://acm.example' } }, 1, 'gm');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ configKey: SYSTEM_CONFIG_KEYS.feishuWebhookSecret, configValue: 'enc:s3cret', isSecret: true }),
      { conflictPaths: ['configKey'] },
    );

    await expect(
      systemConfigService.update({ feishu: { webBaseUrl: 'ftp://bad' } }, 1, 'gm'),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('update: ai / login', () => {
  it('数值合法 upsert，null 删行回落', async () => {
    await systemConfigService.update({ ai: { toolCallBudget: 30 }, login: { maxAttempts: 10 } }, 1, 'gm');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ configKey: SYSTEM_CONFIG_KEYS.aiToolCallBudget, configValue: '30' }),
      { conflictPaths: ['configKey'] },
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ configKey: SYSTEM_CONFIG_KEYS.loginMaxAttempts, configValue: '10' }),
      { conflictPaths: ['configKey'] },
    );

    const del = jest.fn().mockResolvedValue(undefined);
    getRepository.mockReturnValue({ find, findOne, upsert, delete: del });
    await systemConfigService.update({ ai: { toolCallBudget: null }, login: { maxAttempts: null } }, 1, 'gm');
    expect(del).toHaveBeenCalledWith(SYSTEM_CONFIG_KEYS.aiToolCallBudget);
    expect(del).toHaveBeenCalledWith(SYSTEM_CONFIG_KEYS.loginMaxAttempts);
  });

  it('数值越界与布尔非法值抛 400', async () => {
    await expect(systemConfigService.update({ ai: { agentCacheSize: 99 } }, 1, 'gm')).rejects.toMatchObject({
      status: 400,
    });
    await expect(systemConfigService.update({ login: { lockoutMinutes: 99999 } }, 1, 'gm')).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      systemConfigService.update({ login: { bruteForceEnabled: 'yes' } }, 1, 'gm'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('布尔以 true/false 字符串落库', async () => {
    await systemConfigService.update({ login: { captchaEnabled: 'true' } }, 1, 'gm');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ configKey: SYSTEM_CONFIG_KEYS.loginCaptchaEnabled, configValue: 'true' }),
      { conflictPaths: ['configKey'] },
    );
  });
});

describe('getView: 新增 section', () => {
  it('未配置时回落环境变量生效值', async () => {
    const view = await systemConfigService.getView();
    expect(view.feishu).toEqual({
      webhookUrl: 'https://env.feishu.example/hook',
      webhookSecretMasked: null,
      webBaseUrl: 'https://env-web.example',
    });
    expect(view.ai).toEqual({ dailyTokenBudget: 5000000, agentCacheSize: 4, toolCallBudget: 20, toolTimeoutMs: 5000 });
    expect(view.login).toEqual({
      bruteForceEnabled: true,
      maxAttempts: 5,
      lockoutMinutes: 15,
      captchaEnabled: false,
      captchaTtlSeconds: 300,
    });
  });

  it('DB 值优先生效，secret 回显掩码', async () => {
    find.mockResolvedValue([
      row(SYSTEM_CONFIG_KEYS.feishuWebhookUrl, 'https://db.feishu.example/hook'),
      row(SYSTEM_CONFIG_KEYS.feishuWebhookSecret, 'enc:db-secret-9999', true),
      row(SYSTEM_CONFIG_KEYS.aiToolCallBudget, '30'),
      row(SYSTEM_CONFIG_KEYS.loginCaptchaEnabled, 'true'),
    ]);
    const view = await systemConfigService.getView();
    expect(view.feishu.webhookUrl).toBe('https://db.feishu.example/hook');
    expect(view.feishu.webhookSecretMasked).toBe('***9999');
    expect(view.ai.toolCallBudget).toBe(30);
    expect(view.login.captchaEnabled).toBe(true);
  });
});
