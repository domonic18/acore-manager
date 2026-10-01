jest.mock('@/config/load-env', () => ({}));
jest.mock('@/middleware/request-logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@/job/tasks/registry', () => ({
  taskHandlers: {
    inspection: { name: 'inspection', run: jest.fn().mockResolvedValue(0) },
  },
}));

import { logger } from '@/middleware/request-logger';
import { parseJobEvent, runJobEntry } from '@/job/job-entry';
import { taskHandlers } from '@/job/tasks/registry';

const inspectionRun = taskHandlers.inspection.run as jest.Mock;

describe('parseJobEvent', () => {
  it('parses the {task, params} event and defaults params to {}', () => {
    expect(parseJobEvent('{"task":"inspection"}')).toEqual({ task: 'inspection', params: {} });
    expect(parseJobEvent('{"task":"inspection","params":{"date":"2026-09-22"}}')).toEqual({
      task: 'inspection',
      params: { date: '2026-09-22' },
    });
  });

  it('unwraps the Timer trigger envelope and parses Message', () => {
    const raw = JSON.stringify({ Type: 'Timer', TriggerName: 'inspection-daily', Message: '{"task":"inspection"}' });
    expect(parseJobEvent(raw)).toEqual({ task: 'inspection', params: {} });
  });

  it('rejects invalid JSON, non-object events, missing task and bad params', () => {
    expect(() => parseJobEvent('not-json')).toThrow(/合法 JSON/);
    expect(() => parseJobEvent('"plain-string"')).toThrow(/\{task, params\}/);
    expect(() => parseJobEvent('{"params":{}}')).toThrow(/task/);
    expect(() => parseJobEvent('{"task":"inspection","params":"nope"}')).toThrow(/params/);
    expect(() => parseJobEvent('{"Type":"Timer"}')).toThrow(/Message/);
  });
});

describe('runJobEntry', () => {
  beforeEach(() => {
    inspectionRun.mockClear().mockResolvedValue(0);
  });

  it('routes the event to the registered task handler', async () => {
    await expect(
      runJobEntry({ SCF_CUSTOM_CONTAINER_EVENT: '{"task":"inspection","params":{"date":"2026-09-22"}}' }),
    ).resolves.toBe(0);
    expect(inspectionRun).toHaveBeenCalledWith({ date: '2026-09-22' });
  });

  it('returns 2 when the event env var is missing', async () => {
    await expect(runJobEntry({})).resolves.toBe(2);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('SCF_CUSTOM_CONTAINER_EVENT'));
    expect(inspectionRun).not.toHaveBeenCalled();
  });

  it('returns 2 on unparsable events without entering any task', async () => {
    await expect(runJobEntry({ SCF_CUSTOM_CONTAINER_EVENT: 'broken' })).resolves.toBe(2);
    expect(inspectionRun).not.toHaveBeenCalled();
  });

  it('returns 2 for unknown tasks and lists known ones', async () => {
    await expect(runJobEntry({ SCF_CUSTOM_CONTAINER_EVENT: '{"task":"nope"}' })).resolves.toBe(2);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('inspection'));
    expect(inspectionRun).not.toHaveBeenCalled();
  });

  it('propagates the task handler exit code', async () => {
    inspectionRun.mockResolvedValueOnce(1);
    await expect(runJobEntry({ SCF_CUSTOM_CONTAINER_EVENT: '{"task":"inspection"}' })).resolves.toBe(1);
  });
});
