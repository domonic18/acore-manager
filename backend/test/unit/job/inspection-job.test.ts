jest.mock('@/config/load-env', () => ({}));
jest.mock('@/config/database', () => ({
  initializeDataSourcesWithRetry: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/middleware/request-logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@/services/ai/inspection.service', () => ({
  inspectionService: { run: jest.fn().mockResolvedValue({ ok: true, realm: 'r', date: 'd', reportId: 1, error: null, elapsedMs: 1 }) },
}));
jest.mock('@/config/system-config.reader', () => ({
  readDefaultRealm: jest.fn().mockResolvedValue('realm3'),
}));

import { inspectionService } from '@/services/ai/inspection.service';
import { initializeDataSourcesWithRetry } from '@/config/database';
import { readDefaultRealm } from '@/config/system-config.reader';
import { parseJobArgs, runJob } from '@/job/inspection-job';

// 上海时区（UTC+8）边界：SCF 06:00 CST 触发时按 CST"昨日"取数，与 UTC 错位一天
const CST_MIDNIGHT = new Date('2026-09-23T00:00:00+08:00'); // UTC 2026-09-22T16:00Z
const CST_LAST_MIN = new Date('2026-09-22T23:59:59+08:00'); // UTC 2026-09-22T15:59:59Z

describe('inspection-job: parseJobArgs', () => {
  it('parses explicit args and passes them through', () => {
    expect(parseJobArgs(['--realm=realm3', '--date=2026-08-22', '--trigger=manual'])).toEqual({
      realm: 'realm3',
      date: '2026-08-22',
      trigger: 'manual',
    });
  });

  it('defaults trigger to cron and date to yesterday in Asia/Shanghai', () => {
    expect(parseJobArgs(['--realm=realm3'], CST_MIDNIGHT)).toEqual({ realm: 'realm3', date: '2026-09-22', trigger: 'cron' });
  });

  it('keeps the same CST day as yesterday before CST midnight', () => {
    expect(parseJobArgs(['--realm=realm3'], CST_LAST_MIN).date).toBe('2026-09-21');
  });

  it('allows missing realm (resolved from system config at run time)', () => {
    expect(parseJobArgs([], CST_MIDNIGHT)).toEqual({ realm: undefined, date: '2026-09-22', trigger: 'cron' });
  });

  it('rejects malformed date, unsupported trigger and unknown args', () => {
    expect(() => parseJobArgs(['--realm=r', '--date=20260822'], CST_MIDNIGHT)).toThrow(/YYYY-MM-DD/);
    expect(() => parseJobArgs(['--realm=r', '--trigger=chat'], CST_MIDNIGHT)).toThrow(/trigger/);
    expect(() => parseJobArgs(['--realm=r', '--verbose'], CST_MIDNIGHT)).toThrow(/未知参数/);
  });
});

describe('inspection-job: runJob exit codes', () => {
  // runJob 内部用真实时钟取"昨日"，用假时钟固定，避免用例跨日失效
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(CST_MIDNIGHT);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns 0 when the inspection succeeds', async () => {
    (inspectionService.run as jest.Mock).mockResolvedValueOnce({ ok: true });
    await expect(runJob(['--realm=realm3'])).resolves.toBe(0);
    expect(inspectionService.run).toHaveBeenCalledWith({ realm: 'realm3', date: '2026-09-22', trigger: 'cron' });
  });

  it('returns 1 when the inspection fails (failed row already recorded by the service)', async () => {
    (inspectionService.run as jest.Mock).mockResolvedValueOnce({ ok: false, error: 'llm timeout' });
    await expect(runJob(['--realm=realm3'])).resolves.toBe(1);
  });

  it('returns 2 on invalid args without entering the inspection flow', async () => {
    await expect(runJob(['--date=20260822'])).resolves.toBe(2);
    expect(initializeDataSourcesWithRetry).not.toHaveBeenCalled();
  });

  it('falls back to the system default realm when --realm is omitted', async () => {
    (inspectionService.run as jest.Mock).mockResolvedValueOnce({ ok: true });
    await expect(runJob([])).resolves.toBe(0);
    expect(readDefaultRealm).toHaveBeenCalled();
    expect(inspectionService.run).toHaveBeenCalledWith({ realm: 'realm3', date: '2026-09-22', trigger: 'cron' });
  });

  it('returns 2 when data sources are unreachable', async () => {
    (initializeDataSourcesWithRetry as jest.Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(runJob(['--realm=realm3'])).resolves.toBe(2);
  });
});
