jest.mock('@/config/load-env', () => ({}));
jest.mock('@/config/database', () => ({
  acmDataSource: { getRepository: jest.fn() },
  initializeDataSourcesWithRetry: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/middleware/request-logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@/services/ai/targeted-analysis.service', () => ({
  targetedAnalysisService: { sweepStaleRunning: jest.fn().mockResolvedValue(0) },
}));
jest.mock('@/services/ai/targeted-analysis.runner', () => ({
  runTargetedAnalysis: jest.fn().mockResolvedValue({ ok: true, analysisId: 1 }),
}));

import { acmDataSource, initializeDataSourcesWithRetry } from '@/config/database';
import { targetedAnalysisService } from '@/services/ai/targeted-analysis.service';
import { runTargetedAnalysis } from '@/services/ai/targeted-analysis.runner';
import { targetedAnalysisTask, resolveTargetedAnalysisParams } from '@/job/tasks/targeted-analysis-task';

const runMock = runTargetedAnalysis as jest.Mock;
const sweepMock = targetedAnalysisService.sweepStaleRunning as jest.Mock;
const getRepository = acmDataSource.getRepository as jest.Mock;

const ROW = {
  id: 7,
  realm: 'realm3',
  subjectType: 'character',
  subjectName: 'Unparalleled',
  status: 'running',
  timeFrom: new Date('2026-08-15T16:00:00Z'),
  timeTo: new Date('2026-08-23T15:59:59Z'),
};

describe('resolveTargetedAnalysisParams', () => {
  it('passes explicit ids and meta through', () => {
    expect(resolveTargetedAnalysisParams({ ids: [1, 2], meta: { '1': { timeFrom: '2026-08-16', timeTo: '2026-08-23' } } })).toEqual({
      ids: [1, 2],
      meta: { '1': { timeFrom: '2026-08-16', timeTo: '2026-08-23' } },
    });
  });

  it('rejects malformed ids and meta', () => {
    expect(() => resolveTargetedAnalysisParams({})).toThrow(/ids/);
    expect(() => resolveTargetedAnalysisParams({ ids: [] })).toThrow(/ids/);
    expect(() => resolveTargetedAnalysisParams({ ids: [0] })).toThrow(/ids/);
    expect(() => resolveTargetedAnalysisParams({ ids: [1.5] })).toThrow(/ids/);
    expect(() => resolveTargetedAnalysisParams({ ids: ['1'] })).toThrow(/ids/);
    expect(() => resolveTargetedAnalysisParams({ ids: [1], meta: [1] })).toThrow(/meta/);
  });
});

describe('targetedAnalysisTask.run exit codes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getRepository.mockReturnValue({ find: jest.fn().mockResolvedValue([ROW]) });
  });

  it('returns 0 when every row runs successfully with meta passthrough', async () => {
    await expect(targetedAnalysisTask.run({ ids: [7], meta: { '7': { timeFrom: '2026-08-16', timeTo: '2026-08-23', banContext: { reason: '作弊' } } } })).resolves.toBe(0);
    expect(sweepMock).toHaveBeenCalled();
    expect(runMock).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ realm: 'realm3', subjectName: 'Unparalleled', timeFrom: '2026-08-16', timeTo: '2026-08-23', banContext: { reason: '作弊' } }),
    );
  });

  it('falls back to row dates when meta is absent', async () => {
    await targetedAnalysisTask.run({ ids: [7] });
    const subject = runMock.mock.calls[0][1] as { timeFrom: string; timeTo: string };
    expect(subject.timeFrom).toBe('2026-08-16');
    expect(subject.timeTo).toBe('2026-08-23');
  });

  it('returns 1 when any row fails', async () => {
    runMock.mockResolvedValueOnce({ ok: false, analysisId: 7, error: 'llm down' });
    await expect(targetedAnalysisTask.run({ ids: [7] })).resolves.toBe(1);
  });

  it('skips rows that already reached a terminal state', async () => {
    getRepository.mockReturnValue({ find: jest.fn().mockResolvedValue([{ ...ROW, status: 'ok' }]) });
    await expect(targetedAnalysisTask.run({ ids: [7] })).resolves.toBe(0);
    expect(runMock).not.toHaveBeenCalled();
  });

  it('returns 2 on invalid params without touching data sources', async () => {
    await expect(targetedAnalysisTask.run({ ids: 'x' })).resolves.toBe(2);
    expect(initializeDataSourcesWithRetry).not.toHaveBeenCalled();
  });

  it('returns 2 when data sources are unreachable', async () => {
    (initializeDataSourcesWithRetry as jest.Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(targetedAnalysisTask.run({ ids: [7] })).resolves.toBe(2);
  });
});
