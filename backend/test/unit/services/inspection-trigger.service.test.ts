jest.mock('@/config/redis', () => ({
  redis: { set: jest.fn(), del: jest.fn() },
}));
jest.mock('@/services/job-trigger.service', () => ({
  triggerJob: jest.fn(),
}));
jest.mock('@/middleware/request-logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { redis } from '@/config/redis';
import { triggerInspectionJob } from '@/services/ai/inspection-trigger.service';
import { triggerJob } from '@/services/job-trigger.service';

const mockedSet = redis.set as jest.Mock;
const mockedDel = redis.del as jest.Mock;
const mockedTrigger = triggerJob as jest.Mock;

describe('inspection-trigger.service: 手动巡检防重锁', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSet.mockResolvedValue('OK');
    mockedDel.mockResolvedValue(1);
    mockedTrigger.mockResolvedValue({ requestId: 'req-1' });
  });

  it('锁获取成功：透传 realm/date/trigger 触发 SCF Job', async () => {
    const res = await triggerInspectionJob({ realm: 'realm3', date: '2026-09-27', operator: 'gm1' });
    expect(res).toEqual({ requestId: 'req-1' });
    expect(mockedSet).toHaveBeenCalledWith(
      'acm:job-lock:inspection:realm3:2026-09-27',
      'gm1',
      'EX',
      600,
      'NX',
    );
    expect(mockedTrigger).toHaveBeenCalledWith('inspection', {
      realm: 'realm3',
      date: '2026-09-27',
      trigger: 'manual',
    });
    expect(mockedDel).not.toHaveBeenCalled();
  });

  it('锁被占用（NX 返回 null）：抛 429，不触发 Job', async () => {
    mockedSet.mockResolvedValue(null);
    await expect(triggerInspectionJob({ realm: 'realm3', operator: 'gm1' })).rejects.toMatchObject({
      status: 429,
    });
    expect(mockedTrigger).not.toHaveBeenCalled();
  });

  it('Redis 不可用：降级放行，仍触发 Job', async () => {
    mockedSet.mockRejectedValue(new Error('connection refused'));
    await expect(triggerInspectionJob({ operator: 'gm1' })).resolves.toEqual({ requestId: 'req-1' });
    expect(mockedTrigger).toHaveBeenCalledTimes(1);
  });

  it('触发失败：释放锁并原样抛错', async () => {
    mockedTrigger.mockRejectedValue(new Error('SCF error'));
    await expect(triggerInspectionJob({ realm: 'realm3', operator: 'gm1' })).rejects.toThrow('SCF error');
    expect(mockedDel).toHaveBeenCalledWith('acm:job-lock:inspection:realm3:-');
  });
});
