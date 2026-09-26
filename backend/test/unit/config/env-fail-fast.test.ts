// env 模块在 import 期求值并执行生产 fail-fast 守卫：
// 通过 jest.resetModules + 动态 require 驱动不同环境组合。
describe('env production fail-fast guard', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...savedEnv };
    jest.resetModules();
  });

  function loadEnv(): Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@/config/env');
  }

  function setSecrets(): void {
    process.env.JWT_SECRET = 'test-secret';
    process.env.LLM_AES_KEY = 'test-aes-key';
  }

  function setDataSources(): void {
    process.env.DB_URL = 'mysql://u:p@h:3306';
    process.env.ACM_DB_URL = 'postgres://u:p@h:5433/acm';
    process.env.REDIS_URL = 'redis://h:6379';
  }

  it('throws in production when JWT_SECRET is missing', () => {
    process.env.NODE_ENV = 'production';
    setSecrets();
    setDataSources();
    delete process.env.JWT_SECRET;
    expect(() => loadEnv()).toThrow(/JWT_SECRET/);
  });

  it('treats an empty JWT_SECRET as missing', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = '';
    process.env.LLM_AES_KEY = 'k';
    setDataSources();
    expect(() => loadEnv()).toThrow(/JWT_SECRET/);
  });

  it('throws in production when a data source falls back to dev defaults', () => {
    process.env.NODE_ENV = 'production';
    setSecrets();
    setDataSources();
    delete process.env.DB_URL;
    expect(() => loadEnv()).toThrow(/DB_URL/);
  });

  it('collects all missing keys in one error', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    delete process.env.LLM_AES_KEY;
    delete process.env.DB_URL;
    delete process.env.ACM_DB_URL;
    delete process.env.REDIS_URL;
    expect(() => loadEnv()).toThrow(/JWT_SECRET, LLM_AES_KEY, DB_URL, ACM_DB_URL, REDIS_URL/);
  });

  it('passes in production with explicit config', () => {
    process.env.NODE_ENV = 'production';
    setSecrets();
    setDataSources();
    expect(() => loadEnv()).not.toThrow();
  });

  it('keeps weak defaults outside production', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.JWT_SECRET;
    delete process.env.LLM_AES_KEY;
    delete process.env.DB_URL;
    expect(() => loadEnv()).not.toThrow();
  });

  it('defaults NODE_ENV to production when unset', () => {
    setSecrets();
    setDataSources();
    delete process.env.NODE_ENV;
    expect(() => loadEnv()).not.toThrow();

    jest.resetModules();
    delete process.env.JWT_SECRET;
    expect(() => loadEnv()).toThrow(/JWT_SECRET/);
  });

  it('does not fail-fast on SOAP_URL fallback (managed via system config page)', () => {
    process.env.NODE_ENV = 'production';
    setSecrets();
    setDataSources();
    delete process.env.SOAP_URL;
    expect(() => loadEnv()).not.toThrow();
  });
});
