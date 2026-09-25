/**
 * config/database 就绪状态机测试。
 * 模块持有模块级状态（serviceState/initPromise/bootTs），每个用例 jest.isolateModules +
 * require 取全新实例；fake timers 的 now 从 0 起，配合 setup.ts 的 STARTUP_DB_BUDGET_MS=50。
 */
describe('config/database readiness state machine', () => {
  type Db = typeof import('@/config/database');

  function importFresh(): Db {
    let mod!: Db;
    // 动态 import() 在当前 jest CJS 环境不可用，用 isolateModules 取全新模块状态
    jest.isolateModules(() => {
      mod = require('@/config/database');
    });
    return mod;
  }

  function spyInitialize(db: Db) {
    return {
      auth: jest.spyOn(db.authDataSource, 'initialize').mockResolvedValue(),
      characters: jest.spyOn(db.charactersDataSource, 'initialize').mockResolvedValue(),
      world: jest.spyOn(db.worldDataSource, 'initialize').mockResolvedValue(),
      acm: jest.spyOn(db.acmDataSource, 'initialize').mockResolvedValue(),
    };
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts in starting state and turns degraded after budget elapses', () => {
    jest.useFakeTimers({ now: 0 });
    const db = importFresh();

    expect(db.getServiceState()).toBe('starting');

    jest.advanceTimersByTime(100); // budget is 50ms in test env
    expect(db.getServiceState()).toBe('degraded');
  });

  it('marks ready on successful init and initPromise resolves', async () => {
    jest.useFakeTimers({ now: 0 });
    const db = importFresh();
    spyInitialize(db);

    await db.initializeDataSources();

    expect(db.getServiceState()).toBe('ready');
    await expect(db.getInitPromise()).resolves.toBeUndefined();
  });

  it('skips already-initialized DataSources on retry', async () => {
    jest.useFakeTimers({ now: 0 });
    const db = importFresh();
    const spies = spyInitialize(db);
    Object.defineProperty(db.authDataSource, 'isInitialized', { value: true, configurable: true });

    await db.initializeDataSources();

    expect(spies.auth).not.toHaveBeenCalled();
    expect(spies.characters).toHaveBeenCalledTimes(1);
    expect(spies.acm).toHaveBeenCalledTimes(1);
  });

  it('retries infinitely with backoff and self-heals to ready', async () => {
    jest.useFakeTimers({ now: 0 });
    const db = importFresh();
    const spies = spyInitialize(db);
    let acmAttempts = 0;
    spies.acm.mockImplementation(async () => {
      acmAttempts++;
      if (acmAttempts <= 2) throw new Error('connection refused');
    });

    const init = db.initializeDataSourcesWithRetry();

    await jest.advanceTimersByTimeAsync(3_000); // attempt 1 fails, backoff ~2-3s fires, attempt 2 fails
    expect(acmAttempts).toBe(2);
    expect(db.getServiceState()).toBe('degraded');

    await jest.advanceTimersByTimeAsync(5_000); // attempt 2 backoff ~4-5s fires, attempt 3 succeeds
    await init;

    expect(acmAttempts).toBe(3);
    expect(db.getServiceState()).toBe('ready');
    await expect(db.getInitPromise()).resolves.toBeUndefined();
  });
});
