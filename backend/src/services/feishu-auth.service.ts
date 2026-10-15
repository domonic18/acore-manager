import { acmDataSource } from '@/config/database';
import { AcmFeishuBinding } from '@/entities/acm/feishu-binding.entity';
import { issueToken, LoginResult } from '@/services/auth.service';
import { accountRepository } from '@/repositories/account.repository';
import { readRuntimeValues, SYSTEM_CONFIG_KEYS } from '@/config/system-config.reader';
import { auditLogService } from '@/services/audit-log.service';
import { ServiceError } from '@/shared/errors/service-error';
import { logger } from '@/middleware/request-logger';

// 飞书免登（工作台网页应用）：前端 JSSDK requestAccess/requestAuthCode 取一次性 code（3 分钟有效），
// 本服务换取 user_access_token → 拉取 open_id → acm_feishu_bindings 映射 AC 账号 → gmlevel≥1 → 签发 JWT。
// App ID/Secret 仅存 acm_system_config（无 env 回落），未配置 = 免登整体关闭。
// 绑定表是唯一信任源：open_id 不在表内一律拒绝，不自动注册。

const FEISHU_TOKEN_URL = 'https://open.feishu.cn/open-apis/authen/v2/oauth/token';
const FEISHU_USER_INFO_URL = 'https://open.feishu.cn/open-apis/authen/v1/user_info';
const OUTBOUND_TIMEOUT_MS = 10_000;

export interface FeishuBindingInput {
  feishuOpenId: string;
  feishuUnionId?: string;
  feishuName?: string;
  acUsername: string;
}

export class FeishuAuthService {
  async getStatus(): Promise<{ enabled: boolean; appId: string }> {
    const credentials = await this.getCredentials();
    return { enabled: credentials !== null, appId: credentials?.appId ?? '' };
  }

  /** 免登登录主链路：code 换 token → 用户信息 → 绑定映射 → gmlevel 校验 → JWT */
  async loginWithCode(code: string): Promise<LoginResult> {
    const credentials = await this.getCredentials();
    if (!credentials) {
      throw new ServiceError('飞书登录未配置 / Feishu login is not configured', 503);
    }

    const userInfo = await this.fetchFeishuUser(credentials, code);

    const binding = await acmDataSource
      .getRepository(AcmFeishuBinding)
      .findOne({ where: { feishuOpenId: userInfo.openId } });
    if (!binding) {
      logger.warn({ openId: userInfo.openId, feishuName: userInfo.name }, 'Feishu login rejected: not bound');
      throw new ServiceError('该飞书账号未绑定后台账号，请使用密码登录或联系管理员绑定 / Feishu account not bound', 401);
    }

    const account = await accountRepository.findByUsername(binding.acUsername);
    if (!account) {
      logger.error({ openId: userInfo.openId, acUsername: binding.acUsername }, 'Feishu binding target account missing');
      throw new ServiceError('绑定账号不存在（可能已删除），请联系管理员 / bound account not found', 401);
    }

    const gmlevel = await accountRepository.getGmLevel(account.id);
    if (gmlevel < 1) {
      logger.warn({ openId: userInfo.openId, username: account.username, gmlevel }, 'Feishu login rejected: insufficient GM level');
      throw new ServiceError('该账号 GM 权限不足，禁止登录 / insufficient GM level', 403);
    }

    await auditLogService.record({
      operatorId: account.id,
      operatorName: account.username,
      operation: 'auth.feishu.login',
      target: userInfo.openId,
      details: `飞书免登（${userInfo.name || binding.feishuName || userInfo.openId}）`,
    });
    logger.info({ userId: account.id, username: account.username }, 'User logged in via Feishu');

    return { token: issueToken(account, gmlevel), user: { id: account.id, username: account.username, gmlevel } };
  }

  async listBindings(): Promise<AcmFeishuBinding[]> {
    return acmDataSource.getRepository(AcmFeishuBinding).find({ order: { id: 'DESC' } });
  }

  async createBinding(input: FeishuBindingInput, operatorId: number, operatorName: string): Promise<AcmFeishuBinding> {
    const repo = acmDataSource.getRepository(AcmFeishuBinding);

    const account = await accountRepository.findByUsername(input.acUsername);
    if (!account) {
      throw new ServiceError('AC 账号不存在 / account not found', 404);
    }
    const gmlevel = await accountRepository.getGmLevel(account.id);
    if (gmlevel < 1) {
      throw new ServiceError('该账号 gmlevel < 1，绑定后也无法登录 / insufficient GM level', 400);
    }

    const clashByOpenId = await repo.findOne({ where: { feishuOpenId: input.feishuOpenId } });
    if (clashByOpenId) {
      throw new ServiceError(`该飞书用户已绑定账号 ${clashByOpenId.acUsername} / feishu user already bound`, 409);
    }
    const clashByAccount = await repo.findOne({ where: { acUsername: input.acUsername } });
    if (clashByAccount) {
      throw new ServiceError(`账号 ${input.acUsername} 已绑定飞书用户 / account already bound`, 409);
    }

    const saved = await repo.save(
      repo.create({
        feishuOpenId: input.feishuOpenId,
        feishuUnionId: input.feishuUnionId ?? '',
        feishuName: input.feishuName ?? '',
        acUsername: input.acUsername,
        createdBy: operatorName,
      }),
    );
    await auditLogService.record({
      operatorId,
      operatorName,
      operation: 'auth.feishu.bind',
      target: `feishu-binding:${saved.id}`,
      details: `飞书用户 ${saved.feishuName || saved.feishuOpenId} → AC 账号 ${saved.acUsername}`,
    });
    return saved;
  }

  async removeBinding(id: number, operatorId: number, operatorName: string): Promise<void> {
    const repo = acmDataSource.getRepository(AcmFeishuBinding);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new ServiceError('绑定记录不存在 / binding not found', 404);
    await repo.remove(existing);
    await auditLogService.record({
      operatorId,
      operatorName,
      operation: 'auth.feishu.unbind',
      target: `feishu-binding:${id}`,
      details: `解除绑定：飞书用户 ${existing.feishuName || existing.feishuOpenId} ↔ AC 账号 ${existing.acUsername}`,
    });
  }

  private async getCredentials(): Promise<{ appId: string; appSecret: string } | null> {
    try {
      const values = await readRuntimeValues([SYSTEM_CONFIG_KEYS.feishuAppId, SYSTEM_CONFIG_KEYS.feishuAppSecret]);
      const appId = values.get(SYSTEM_CONFIG_KEYS.feishuAppId);
      const appSecret = values.get(SYSTEM_CONFIG_KEYS.feishuAppSecret);
      if (!appId || !appSecret) return null;
      return { appId, appSecret };
    } catch (err) {
      logger.warn({ err }, '[feishu-auth] 凭证读取失败，免登视为未配置');
      return null;
    }
  }

  private async fetchFeishuUser(
    credentials: { appId: string; appSecret: string },
    code: string,
  ): Promise<{ openId: string; unionId: string; name: string }> {
    // JSAPI 免登 code 非重定向流，官方示例不携带 redirect_uri
    const tokenRes = await fetch(FEISHU_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: credentials.appId,
        client_secret: credentials.appSecret,
        code,
      }),
      signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
    }).catch((err) => {
      logger.warn({ err }, '[feishu-auth] 换取 user_access_token 网络失败');
      throw new ServiceError('飞书服务不可达，请稍后重试 / feishu service unreachable', 502);
    });

    const tokenBody = (await tokenRes.json().catch(() => null)) as
      | { access_token?: string; error?: string; error_description?: string }
      | null;
    if (!tokenRes.ok || !tokenBody?.access_token) {
      logger.warn(
        { status: tokenRes.status, error: tokenBody?.error, desc: tokenBody?.error_description },
        '[feishu-auth] 授权码兑换失败',
      );
      throw new ServiceError('飞书授权码无效或已过期 / invalid or expired feishu code', 401);
    }

    const infoRes = await fetch(FEISHU_USER_INFO_URL, {
      headers: { Authorization: `Bearer ${tokenBody.access_token}` },
      signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
    }).catch((err) => {
      logger.warn({ err }, '[feishu-auth] 获取用户信息网络失败');
      throw new ServiceError('飞书服务不可达，请稍后重试 / feishu service unreachable', 502);
    });

    const infoBody = (await infoRes.json().catch(() => null)) as
      | { code?: number; msg?: string; data?: { open_id?: string; union_id?: string; name?: string } }
      | null;
    if (!infoRes.ok || infoBody?.code !== 0 || !infoBody.data?.open_id) {
      logger.warn({ status: infoRes.status, code: infoBody?.code, msg: infoBody?.msg }, '[feishu-auth] 获取用户信息失败');
      throw new ServiceError('获取飞书用户信息失败 / failed to fetch feishu user info', 401);
    }

    return {
      openId: infoBody.data.open_id,
      unionId: infoBody.data.union_id ?? '',
      name: infoBody.data.name ?? '',
    };
  }
}

export const feishuAuthService = new FeishuAuthService();
