jest.mock('@/config/env', () => ({
  env: {
    TENCENT_SECRET_ID: 'id-1',
    TENCENT_SECRET_KEY: 'key-1',
    TENCENT_SCF_REGION: 'ap-guangzhou',
    TENCENT_SCF_NAMESPACE: 'default',
    TENCENT_SCF_JOB_FUNCTION_NAME: 'acore-manager-job',
    TENCENT_SCF_ENDPOINT: 'http://127.0.0.1:9011',
  },
}));
jest.mock('@/shared/utils/scf-invoke.util', () => ({
  invokeScfFunction: jest.fn().mockResolvedValue({ requestId: 'req-9' }),
}));

import { invokeScfFunction } from '@/shared/utils/scf-invoke.util';
import { listMissingScfEnv, triggerJob } from '@/services/job-trigger.service';
import { JOB_TASK } from '@/shared/enums/job-task';

const invokeMock = invokeScfFunction as jest.Mock;

describe('listMissingScfEnv', () => {
  it('lists every missing required variable by name', () => {
    expect(
      listMissingScfEnv({ TENCENT_SECRET_KEY: 'key-1', TENCENT_SCF_NAMESPACE: 'default', TENCENT_SCF_JOB_FUNCTION_NAME: 'fn' }),
    ).toEqual(['TENCENT_SECRET_ID', 'TENCENT_SCF_REGION']);
    expect(listMissingScfEnv({})).toEqual([
      'TENCENT_SECRET_ID',
      'TENCENT_SECRET_KEY',
      'TENCENT_SCF_REGION',
      'TENCENT_SCF_JOB_FUNCTION_NAME',
    ]);
    expect(
      listMissingScfEnv({
        TENCENT_SECRET_ID: 'i',
        TENCENT_SECRET_KEY: 'k',
        TENCENT_SCF_REGION: 'r',
        TENCENT_SCF_JOB_FUNCTION_NAME: 'f',
      }),
    ).toEqual([]);
  });
});

describe('triggerJob', () => {
  beforeEach(() => {
    invokeMock.mockClear().mockResolvedValue({ requestId: 'req-9' });
  });

  it('invokes the job function with a {task, params} JSON event and returns requestId', async () => {
    const params = { realm: 'realm2', date: '2026-09-25', trigger: 'manual' };

    await expect(triggerJob(JOB_TASK.INSPECTION, params)).resolves.toEqual({ requestId: 'req-9' });

    const opts = invokeMock.mock.calls[0][0];
    expect(opts.functionName).toBe('acore-manager-job');
    expect(opts.namespace).toBe('default');
    expect(opts.region).toBe('ap-guangzhou');
    expect(opts.secretId).toBe('id-1');
    expect(opts.secretKey).toBe('key-1');
    expect(opts.endpoint).toBe('http://127.0.0.1:9011');
    expect(JSON.parse(opts.clientContext)).toEqual({ task: 'inspection', params });
  });

  it('propagates invoke failures as ServiceError 502 with the original message', async () => {
    invokeMock.mockRejectedValueOnce(new Error('云函数 Invoke 失败 [AuthFailure]: bad signature'));

    await expect(triggerJob(JOB_TASK.INSPECTION, {})).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('AuthFailure'),
    });
  });
});
