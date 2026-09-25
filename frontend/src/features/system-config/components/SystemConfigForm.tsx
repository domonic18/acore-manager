import { FormEvent, useEffect, useState } from 'react';
import { useSoapTest, useSystemConfig, useUpdateSystemConfig } from '../hooks/useSystemConfig';
import { toast } from '@/shared/utils/toast.util';
import { PlayCircle } from 'lucide-react';

const inputClass =
  'w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring';
const labelClass = 'mb-1 block text-sm font-medium';
const selectClass =
  'px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring';

// 三组新增配置的空值语义：保存时空 = 清除该项并回落环境变量
export function SystemConfigForm() {
  const { data: config, isLoading } = useSystemConfig();
  const updateMutation = useUpdateSystemConfig();
  const soapTestMutation = useSoapTest();

  const [realm, setRealm] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [clearWebhookSecret, setClearWebhookSecret] = useState(false);
  const [webBaseUrl, setWebBaseUrl] = useState('');

  const [dailyTokenBudget, setDailyTokenBudget] = useState('');
  const [agentCacheSize, setAgentCacheSize] = useState('');
  const [toolCallBudget, setToolCallBudget] = useState('');
  const [toolTimeoutMs, setToolTimeoutMs] = useState('');

  const [bruteForceEnabled, setBruteForceEnabled] = useState('true');
  const [maxAttempts, setMaxAttempts] = useState('');
  const [lockoutMinutes, setLockoutMinutes] = useState('');
  const [captchaEnabled, setCaptchaEnabled] = useState('false');
  const [captchaTtlSeconds, setCaptchaTtlSeconds] = useState('');

  useEffect(() => {
    if (!config) return;
    setRealm(config.defaultRealm);
    setHost(config.soap.source === 'db' ? config.soap.host : '');
    setPort(config.soap.source === 'db' ? String(config.soap.port) : '');
    setUsername(config.soap.source === 'db' ? config.soap.username : '');

    setWebhookUrl(config.feishu.webhookUrl);
    setWebBaseUrl(config.feishu.webBaseUrl);

    setDailyTokenBudget(String(config.ai.dailyTokenBudget));
    setAgentCacheSize(String(config.ai.agentCacheSize));
    setToolCallBudget(String(config.ai.toolCallBudget));
    setToolTimeoutMs(String(config.ai.toolTimeoutMs));

    setBruteForceEnabled(config.login.bruteForceEnabled ? 'true' : 'false');
    setMaxAttempts(String(config.login.maxAttempts));
    setLockoutMinutes(String(config.login.lockoutMinutes));
    setCaptchaEnabled(config.login.captchaEnabled ? 'true' : 'false');
    setCaptchaTtlSeconds(String(config.login.captchaTtlSeconds));
  }, [config]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const soap: Record<string, string | number> = {};
    if (host.trim()) soap.host = host.trim();
    if (port.trim()) soap.port = Number(port.trim());
    if (username.trim()) soap.username = username.trim();
    if (password) soap.password = password;

    // 空输入提交 null = 清除该键，回落环境变量（AI 参数/登录安全数值；飞书为空串）
    const ai = {
      dailyTokenBudget: dailyTokenBudget.trim() === '' ? null : Number(dailyTokenBudget.trim()),
      agentCacheSize: agentCacheSize.trim() === '' ? null : Number(agentCacheSize.trim()),
      toolCallBudget: toolCallBudget.trim() === '' ? null : Number(toolCallBudget.trim()),
      toolTimeoutMs: toolTimeoutMs.trim() === '' ? null : Number(toolTimeoutMs.trim()),
    };
    const login = {
      bruteForceEnabled,
      maxAttempts: maxAttempts.trim() === '' ? null : Number(maxAttempts.trim()),
      lockoutMinutes: lockoutMinutes.trim() === '' ? null : Number(lockoutMinutes.trim()),
      captchaEnabled,
      captchaTtlSeconds: captchaTtlSeconds.trim() === '' ? null : Number(captchaTtlSeconds.trim()),
    };

    try {
      await updateMutation.mutateAsync({
        defaultRealm: realm.trim(),
        ...(Object.keys(soap).length > 0 ? { soap } : {}),
        feishu: {
          webhookUrl: webhookUrl.trim(),
          // 密钥 write-only：输入新值覆盖、勾选清除、留空不修改（与 SOAP 密码同规则）
          ...(clearWebhookSecret ? { webhookSecret: null } : webhookSecret ? { webhookSecret } : {}),
          webBaseUrl: webBaseUrl.trim(),
        },
        ai,
        login,
      });
      setPassword('');
      setWebhookSecret('');
      setClearWebhookSecret(false);
      toast.success('系统配置已保存');
    } catch (err) {
      toast.error((err as Error).message || '保存失败');
    }
  };

  const handleSoapTest = async () => {
    try {
      const result = await soapTestMutation.mutateAsync();
      if (result.ok) {
        toast.success(`SOAP 连接正常（${result.latencyMs}ms）`);
      } else {
        toast.error(`SOAP 连接失败：${result.error ?? '未知错误'}`);
      }
    } catch (err) {
      toast.error((err as Error).message || '测试请求失败');
    }
  };

  if (isLoading) {
    return <div className='text-sm text-muted-foreground'>加载中…</div>;
  }

  const soapFromEnv = config?.soap.source === 'env';

  return (
    <form onSubmit={handleSave} className='max-w-2xl space-y-6'>
      <section className='rounded-lg border border-border bg-card p-4 space-y-3'>
        <h2 className='text-base font-semibold'>默认 Realm</h2>
        <p className='text-xs text-muted-foreground'>
          AI 诊断/巡检在未指定 realm 时使用的默认值（COS 日志路径与巡检入参）。生产环境请按 realmlist 目录名填写，如 realm2。
        </p>
        <div>
          <label className={labelClass} htmlFor='default-realm'>realm 目录名</label>
          <input
            id='default-realm'
            value={realm}
            onChange={(e) => setRealm(e.target.value)}
            placeholder='realm3'
            className={inputClass}
          />
        </div>
      </section>

      <section className='rounded-lg border border-border bg-card p-4 space-y-3'>
        <div className='flex items-center justify-between'>
          <h2 className='text-base font-semibold'>SOAP 连接（worldserver）</h2>
          <span className='text-xs text-muted-foreground'>
            {soapFromEnv ? '当前生效：环境变量回落' : '当前生效：数据库配置'}
          </span>
        </div>
        <p className='text-xs text-muted-foreground'>
          GM 命令经 SOAP 发往 worldserver。四项均填写后启用数据库配置；任一留空则回落 SOAP_URL 环境变量。密码留空表示不修改。
        </p>
        <div className='grid gap-3 sm:grid-cols-2'>
          <div>
            <label className={labelClass} htmlFor='soap-host'>主机</label>
            <input
              id='soap-host'
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder={soapFromEnv ? config?.soap.host : ''}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor='soap-port'>端口</label>
            <input
              id='soap-port'
              type='number'
              min={1}
              max={65535}
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder={soapFromEnv ? String(config?.soap.port ?? '') : ''}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor='soap-username'>用户名</label>
            <input
              id='soap-username'
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={soapFromEnv ? config?.soap.username : ''}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor='soap-password'>密码</label>
            <input
              id='soap-password'
              type='password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={config?.soap.passwordMasked ?? '未配置（使用环境变量）'}
              className={inputClass}
            />
          </div>
        </div>
        <button
          type='button'
          onClick={handleSoapTest}
          disabled={soapTestMutation.isPending}
          className='inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50'
        >
          <PlayCircle className='h-4 w-4' />
          {soapTestMutation.isPending ? '测试中…' : '测试连接'}
        </button>
      </section>

      <section className='rounded-lg border border-border bg-card p-4 space-y-3'>
        <h2 className='text-base font-semibold'>飞书通知</h2>
        <p className='text-xs text-muted-foreground'>
          AI 告警与日报推送（Token 超限 / 巡检失败 / 断传）。地址留空保存 = 清除并回落环境变量；加签密钥仅回显掩码，输入新值即覆盖、留空表示不修改。
        </p>
        <div className='space-y-3'>
          <div>
            <label className={labelClass} htmlFor='feishu-webhook'>Webhook 地址</label>
            <input
              id='feishu-webhook'
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder='https://open.feishu.cn/open-apis/bot/v2/hook/xxx'
              className={inputClass}
            />
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div>
              <label className={labelClass} htmlFor='feishu-secret'>加签密钥</label>
              <input
                id='feishu-secret'
                type='password'
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder={config?.feishu.webhookSecretMasked ?? '未配置（使用环境变量）'}
                className={inputClass}
              />
              {config?.feishu.webhookSecretMasked && (
                <label className='mt-1 flex items-center gap-1.5 text-xs text-muted-foreground'>
                  <input
                    type='checkbox'
                    checked={clearWebhookSecret}
                    onChange={(e) => setClearWebhookSecret(e.target.checked)}
                  />
                  保存时清除已配置密钥
                </label>
              )}
            </div>
            <div>
              <label className={labelClass} htmlFor='feishu-web-base'>Web 基地址（日报跳转）</label>
              <input
                id='feishu-web-base'
                value={webBaseUrl}
                onChange={(e) => setWebBaseUrl(e.target.value)}
                placeholder='https://your-admin-site.com'
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </section>

      <section className='rounded-lg border border-border bg-card p-4 space-y-3'>
        <h2 className='text-base font-semibold'>AI 参数</h2>
        <p className='text-xs text-muted-foreground'>
          Agent 运行阈值。留空保存 = 回落环境变量默认值。
        </p>
        <div className='grid gap-3 sm:grid-cols-2'>
          <div>
            <label className={labelClass} htmlFor='ai-budget'>Token 日预算</label>
            <input
              id='ai-budget'
              type='number'
              min={1000}
              max={1000000000}
              value={dailyTokenBudget}
              onChange={(e) => setDailyTokenBudget(e.target.value)}
              placeholder='5000000（超限仅飞书告警）'
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor='ai-cache'>Agent 缓存容量</label>
            <input
              id='ai-cache'
              type='number'
              min={1}
              max={50}
              value={agentCacheSize}
              onChange={(e) => setAgentCacheSize(e.target.value)}
              placeholder='4（LRU 淘汰）'
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor='ai-tool-budget'>单任务工具调用上限</label>
            <input
              id='ai-tool-budget'
              type='number'
              min={1}
              max={200}
              value={toolCallBudget}
              onChange={(e) => setToolCallBudget(e.target.value)}
              placeholder='20'
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor='ai-tool-timeout'>工具默认超时（ms）</label>
            <input
              id='ai-tool-timeout'
              type='number'
              min={1000}
              max={600000}
              value={toolTimeoutMs}
              onChange={(e) => setToolTimeoutMs(e.target.value)}
              placeholder='5000'
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className='rounded-lg border border-border bg-card p-4 space-y-3'>
        <h2 className='text-base font-semibold'>登录安全</h2>
        <p className='text-xs text-muted-foreground'>
          防暴力破解与图形验证码（失败 3 次后触发验证码）。留空保存 = 回落环境变量。
        </p>
        <div className='grid gap-3 sm:grid-cols-2'>
          <div>
            <label className={labelClass} htmlFor='login-brute'>防暴力破解</label>
            <select
              id='login-brute'
              value={bruteForceEnabled}
              onChange={(e) => setBruteForceEnabled(e.target.value)}
              className={selectClass}
            >
              <option value='true'>启用</option>
              <option value='false'>停用</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor='login-captcha'>图形验证码</label>
            <select
              id='login-captcha'
              value={captchaEnabled}
              onChange={(e) => setCaptchaEnabled(e.target.value)}
              className={selectClass}
            >
              <option value='true'>启用</option>
              <option value='false'>停用</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor='login-max-attempts'>最大失败次数</label>
            <input
              id='login-max-attempts'
              type='number'
              min={1}
              max={100}
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(e.target.value)}
              placeholder='5'
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor='login-lockout'>锁定时间（分钟）</label>
            <input
              id='login-lockout'
              type='number'
              min={1}
              max={1440}
              value={lockoutMinutes}
              onChange={(e) => setLockoutMinutes(e.target.value)}
              placeholder='15'
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor='login-captcha-ttl'>验证码有效期（秒）</label>
            <input
              id='login-captcha-ttl'
              type='number'
              min={60}
              max={3600}
              value={captchaTtlSeconds}
              onChange={(e) => setCaptchaTtlSeconds(e.target.value)}
              placeholder='300'
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <button
        type='submit'
        disabled={updateMutation.isPending}
        className='rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
      >
        {updateMutation.isPending ? '保存中…' : '保存配置'}
      </button>
    </form>
  );
}
