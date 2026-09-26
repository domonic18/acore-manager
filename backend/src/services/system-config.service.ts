import { acmDataSource } from '@/config/database';
import { env, soapConn } from '@/config/env';
import { DEFAULT_REALM_FALLBACK, loadConfigValues, readDefaultRealm, SYSTEM_CONFIG_KEYS } from '@/config/system-config.reader';
import { AcmSystemConfig } from '@/entities/acm/system-config.entity';
import { auditLogService } from '@/services/audit-log.service';
import { ServiceError } from '@/shared/errors/service-error';
import { encryptToken, maskToken } from '@/shared/utils/aes.util';

// 系统级配置（KV）：默认 realm 名 + SOAP 连接 + 飞书通知 + AI 参数 + 登录安全。
// 读取策略：DB 优先，未录入/不完整时回落环境变量（SOAP 需整条齐全才走 DB），
// 保证本地开发 / 未录入配置时零改动；不做缓存，改库即热生效。
// 新增三组的空值语义：空串/null = 删除该键行回落 env（soap 例外，留空 = 保留原密码）。

export { DEFAULT_REALM_FALLBACK, SYSTEM_CONFIG_KEYS };

export interface SoapConnConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  source: 'db' | 'env';
}

export interface SystemConfigView {
  defaultRealm: string;
  soap: {
    host: string;
    port: number;
    username: string;
    passwordMasked: string | null;
    source: 'db' | 'env';
  };
  feishu: {
    webhookUrl: string;
    webhookSecretMasked: string | null;
    webBaseUrl: string;
  };
  ai: {
    dailyTokenBudget: number;
    agentCacheSize: number;
    toolCallBudget: number;
    toolTimeoutMs: number;
  };
  login: {
    bruteForceEnabled: boolean;
    maxAttempts: number;
    lockoutMinutes: number;
    captchaEnabled: boolean;
    captchaTtlSeconds: number;
  };
  updatedAt: string | null;
}

export interface SystemConfigInput {
  defaultRealm?: string;
  soap?: {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
  };
  feishu?: {
    /** 空串/null = 清除该键（回落环境变量） */
    webhookUrl?: string | null;
    webhookSecret?: string | null;
    webBaseUrl?: string | null;
  };
  ai?: {
    /** null = 清除该键（回落环境变量） */
    dailyTokenBudget?: number | null;
    agentCacheSize?: number | null;
    toolCallBudget?: number | null;
    toolTimeoutMs?: number | null;
  };
  login?: {
    bruteForceEnabled?: string;
    maxAttempts?: number | null;
    lockoutMinutes?: number | null;
    captchaEnabled?: string;
    captchaTtlSeconds?: number | null;
  };
}

class SystemConfigService {
  private get repo() {
    return acmDataSource.getRepository(AcmSystemConfig);
  }

  async getDefaultRealm(): Promise<string> {
    return readDefaultRealm();
  }

  async getSoapConn(): Promise<SoapConnConfig> {
    const values = await loadConfigValues();
    const host = values.get(SYSTEM_CONFIG_KEYS.soapHost);
    const port = values.get(SYSTEM_CONFIG_KEYS.soapPort);
    const user = values.get(SYSTEM_CONFIG_KEYS.soapUsername);
    const pass = values.get(SYSTEM_CONFIG_KEYS.soapPassword);
    if (host && port && user && pass) {
      return { host, port: Number(port), user, pass, source: 'db' };
    }
    return { host: soapConn.host, port: soapConn.port, user: soapConn.user, pass: soapConn.pass, source: 'env' };
  }

  async getView(): Promise<SystemConfigView> {
    const [values, soap, latestRows] = await Promise.all([
      loadConfigValues(),
      this.getSoapConn(),
      this.repo.find({ order: { updatedAt: 'DESC' }, take: 1 }),
    ]);
    const latest = latestRows[0];
    const dbString = (key: string): string | undefined => values.get(key);
    const dbInt = (key: string): number | undefined => {
      const raw = values.get(key);
      if (raw === undefined) return undefined;
      const parsed = Number(raw);
      return Number.isInteger(parsed) ? parsed : undefined;
    };
    return {
      defaultRealm: values.get(SYSTEM_CONFIG_KEYS.defaultRealm) ?? DEFAULT_REALM_FALLBACK,
      soap: {
        host: soap.host,
        port: soap.port,
        username: soap.user,
        passwordMasked: soap.source === 'db' ? maskToken(values.get(SYSTEM_CONFIG_KEYS.soapPassword) ?? '') : null,
        source: soap.source,
      },
      feishu: {
        webhookUrl: dbString(SYSTEM_CONFIG_KEYS.feishuWebhookUrl) ?? env.FEISHU_WEBHOOK_URL,
        webhookSecretMasked:
          dbString(SYSTEM_CONFIG_KEYS.feishuWebhookSecret) !== undefined
            ? maskToken(dbString(SYSTEM_CONFIG_KEYS.feishuWebhookSecret) ?? '')
            : null,
        webBaseUrl: dbString(SYSTEM_CONFIG_KEYS.acmWebBaseUrl) ?? env.ACM_WEB_BASE_URL,
      },
      ai: {
        dailyTokenBudget: dbInt(SYSTEM_CONFIG_KEYS.aiDailyTokenBudget) ?? env.AI_DAILY_TOKEN_BUDGET,
        agentCacheSize: dbInt(SYSTEM_CONFIG_KEYS.aiAgentCacheSize) ?? env.AI_AGENT_CACHE_SIZE,
        toolCallBudget: dbInt(SYSTEM_CONFIG_KEYS.aiToolCallBudget) ?? env.AI_TOOL_CALL_BUDGET,
        toolTimeoutMs: dbInt(SYSTEM_CONFIG_KEYS.aiToolTimeoutMs) ?? env.AI_TOOL_TIMEOUT_MS,
      },
      login: {
        bruteForceEnabled:
          (dbString(SYSTEM_CONFIG_KEYS.loginBruteForceEnabled) ?? String(env.LOGIN_BRUTE_FORCE_ENABLED)) === 'true',
        maxAttempts: dbInt(SYSTEM_CONFIG_KEYS.loginMaxAttempts) ?? env.LOGIN_MAX_ATTEMPTS,
        lockoutMinutes: dbInt(SYSTEM_CONFIG_KEYS.loginLockoutMinutes) ?? env.LOGIN_LOCKOUT_MINUTES,
        captchaEnabled:
          (dbString(SYSTEM_CONFIG_KEYS.loginCaptchaEnabled) ?? String(env.LOGIN_CAPTCHA_ENABLED)) === 'true',
        captchaTtlSeconds: dbInt(SYSTEM_CONFIG_KEYS.loginCaptchaTtlSeconds) ?? env.LOGIN_CAPTCHA_TTL_SECONDS,
      },
      updatedAt: latest?.updatedAt ? new Date(latest.updatedAt).toISOString() : null,
    };
  }

  // 五配置组按序生效：defaultRealm → soap → feishu → ai → login；任一组校验失败即中止
  //（已生效的组不回滚——KV 单键写入天然原子，审计只记录实际变更的键）
  async update(input: SystemConfigInput, operatorId: number, operatorName: string): Promise<SystemConfigView> {
    const changedKeys: string[] = [];
    if (input.defaultRealm !== undefined) await this.applyDefaultRealm(input.defaultRealm, changedKeys, operatorName);
    if (input.soap) await this.applySoap(input.soap, changedKeys, operatorName);
    if (input.feishu) await this.applyFeishu(input.feishu, changedKeys, operatorName);
    if (input.ai) await this.applyAi(input.ai, changedKeys, operatorName);
    if (input.login) await this.applyLogin(input.login, changedKeys, operatorName);

    if (changedKeys.length > 0) {
      await auditLogService.record({
        operatorId,
        operatorName,
        operation: 'system-config.update',
        target: changedKeys.join(','),
        details: changedKeys.includes(SYSTEM_CONFIG_KEYS.soapPassword) ? '含 soap_password 更新（值不落日志）' : '',
      });
    }
    return this.getView();
  }

  private async applyDefaultRealm(realm: string, changedKeys: string[], operatorName: string): Promise<void> {
    if (!/^[a-zA-Z0-9_-]{2,32}$/.test(realm)) {
      throw new ServiceError('realm 名需为 2-32 位字母/数字/中划线/下划线 / invalid realm name', 400);
    }
    await this.upsert(SYSTEM_CONFIG_KEYS.defaultRealm, realm, false, operatorName);
    changedKeys.push(SYSTEM_CONFIG_KEYS.defaultRealm);
  }

  private async applySoap(soap: NonNullable<SystemConfigInput['soap']>, changedKeys: string[], operatorName: string): Promise<void> {
    if (soap.host !== undefined) {
      await this.upsert(SYSTEM_CONFIG_KEYS.soapHost, soap.host, false, operatorName);
      changedKeys.push(SYSTEM_CONFIG_KEYS.soapHost);
    }
    if (soap.port !== undefined) {
      if (!Number.isInteger(soap.port) || soap.port < 1 || soap.port > 65535) {
        throw new ServiceError('端口需为 1-65535 整数 / invalid port', 400);
      }
      await this.upsert(SYSTEM_CONFIG_KEYS.soapPort, String(soap.port), false, operatorName);
      changedKeys.push(SYSTEM_CONFIG_KEYS.soapPort);
    }
    if (soap.username !== undefined) {
      await this.upsert(SYSTEM_CONFIG_KEYS.soapUsername, soap.username, false, operatorName);
      changedKeys.push(SYSTEM_CONFIG_KEYS.soapUsername);
    }
    // 留空 = 保留原密码（write-only，与 llm-config api_key 同规则）
    if (soap.password) {
      await this.upsert(SYSTEM_CONFIG_KEYS.soapPassword, encryptToken(soap.password), true, operatorName);
      changedKeys.push(SYSTEM_CONFIG_KEYS.soapPassword);
    }
  }

  private async applyFeishu(feishu: NonNullable<SystemConfigInput['feishu']>, changedKeys: string[], operatorName: string): Promise<void> {
    if (feishu.webhookUrl !== undefined) {
      await this.saveOrClear(SYSTEM_CONFIG_KEYS.feishuWebhookUrl, feishu.webhookUrl, operatorName, {
        pattern: /^https:\/\/\S+$/,
        message: 'webhook 地址需为 https URL / invalid webhook url',
      });
      changedKeys.push(SYSTEM_CONFIG_KEYS.feishuWebhookUrl);
    }
    if (feishu.webhookSecret !== undefined) {
      // 空串 = 清除加签密钥（回落环境变量 / 不签名）
      await this.saveOrClear(SYSTEM_CONFIG_KEYS.feishuWebhookSecret, feishu.webhookSecret, operatorName, {
        encrypt: true,
        maxLength: 256,
        message: '加签密钥过长 / invalid webhook secret',
      });
      changedKeys.push(SYSTEM_CONFIG_KEYS.feishuWebhookSecret);
    }
    if (feishu.webBaseUrl !== undefined) {
      await this.saveOrClear(SYSTEM_CONFIG_KEYS.acmWebBaseUrl, feishu.webBaseUrl, operatorName, {
        pattern: /^https?:\/\/\S+$/,
        message: 'Web 基地址需为 http(s) URL / invalid web base url',
      });
      changedKeys.push(SYSTEM_CONFIG_KEYS.acmWebBaseUrl);
    }
  }

  private async applyAi(ai: NonNullable<SystemConfigInput['ai']>, changedKeys: string[], operatorName: string): Promise<void> {
    await this.applyNumberChecks(
      [
        [SYSTEM_CONFIG_KEYS.aiDailyTokenBudget, ai.dailyTokenBudget, 1_000, 1_000_000_000],
        [SYSTEM_CONFIG_KEYS.aiAgentCacheSize, ai.agentCacheSize, 1, 50],
        [SYSTEM_CONFIG_KEYS.aiToolCallBudget, ai.toolCallBudget, 1, 200],
        [SYSTEM_CONFIG_KEYS.aiToolTimeoutMs, ai.toolTimeoutMs, 1_000, 600_000],
      ],
      changedKeys,
      operatorName,
    );
  }

  private async applyLogin(login: NonNullable<SystemConfigInput['login']>, changedKeys: string[], operatorName: string): Promise<void> {
    for (const [key, value] of [
      [SYSTEM_CONFIG_KEYS.loginBruteForceEnabled, login.bruteForceEnabled],
      [SYSTEM_CONFIG_KEYS.loginCaptchaEnabled, login.captchaEnabled],
    ] as const) {
      if (value === undefined) continue;
      if (value === null) {
        await this.repo.delete(key);
        changedKeys.push(key);
        continue;
      }
      if (value !== 'true' && value !== 'false') {
        throw new ServiceError(`${key} 仅接受 true/false / invalid ${key}`, 400);
      }
      await this.upsert(key, value, false, operatorName);
      changedKeys.push(key);
    }
    await this.applyNumberChecks(
      [
        [SYSTEM_CONFIG_KEYS.loginMaxAttempts, login.maxAttempts, 1, 100],
        [SYSTEM_CONFIG_KEYS.loginLockoutMinutes, login.lockoutMinutes, 1, 1440],
        [SYSTEM_CONFIG_KEYS.loginCaptchaTtlSeconds, login.captchaTtlSeconds, 60, 3600],
      ],
      changedKeys,
      operatorName,
    );
  }

  /** 数字组统一处理：undefined 跳过 / null 删行回落 env / 区间校验后保存 */
  private async applyNumberChecks(
    rows: readonly [string, number | null | undefined, number, number][],
    changedKeys: string[],
    operatorName: string,
  ): Promise<void> {
    for (const [key, value, min, max] of rows) {
      if (value === undefined) continue;
      if (value === null) {
        await this.repo.delete(key);
        changedKeys.push(key);
        continue;
      }
      if (!this.checkInt(value, min, max)) {
        throw new ServiceError(`${key} 需为 ${min}-${max} 整数 / invalid ${key}`, 400);
      }
      await this.saveOrClear(key, value, operatorName);
      changedKeys.push(key);
    }
  }

  private checkInt(value: number | null, min: number, max: number): value is number {
    return value !== null && Number.isInteger(value) && value >= min && value <= max;
  }

  /** 非空保存（可选校验/加密）；空串/null = 删除该键行，回落环境变量 */
  private async saveOrClear(
    configKey: string,
    value: string | number | null,
    operatorName: string,
    opts?: { pattern?: RegExp; message?: string; encrypt?: boolean; maxLength?: number },
  ): Promise<void> {
    if (typeof value === 'number') {
      await this.upsert(configKey, String(value), false, operatorName);
      return;
    }
    if (value === '' || value === null) {
      await this.repo.delete(configKey);
      return;
    }
    if (opts?.maxLength && value.length > opts.maxLength) {
      throw new ServiceError(opts.message ?? 'invalid value', 400);
    }
    if (opts?.pattern && !opts.pattern.test(value)) {
      throw new ServiceError(opts.message ?? 'invalid value', 400);
    }
    const stored = opts?.encrypt ? encryptToken(value) : value;
    await this.upsert(configKey, stored, opts?.encrypt ?? false, operatorName);
  }

  private async upsert(configKey: string, configValue: string, isSecret: boolean, updatedBy: string): Promise<void> {
    await this.repo.upsert(
      { configKey, configValue, isSecret, updatedBy: updatedBy || String(0) },
      { conflictPaths: ['configKey'] },
    );
  }
}

export const systemConfigService = new SystemConfigService();
