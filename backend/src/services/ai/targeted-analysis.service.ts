import { acmDataSource } from '@/config/database';
import { logger } from '@/middleware/request-logger';
import { AiTargetedAnalysis } from '@/entities/acm/ai-targeted-analysis.entity';
import { JOB_TASK } from '@/shared/enums/job-task';
import { triggerJob } from '@/services/job-trigger.service';
import { auditLogService } from '@/services/audit-log.service';
import { ServiceError } from '@/shared/errors/service-error';

export type { AnalysisConclusion, AnalysisSuggestion } from './targeted-analysis.conclusion';

// 定向分析编排（arch 5.1 / 需求 3.8，账号申诉场景）：异步化改造后 web 侧只负责
// 建行（批量≤10，一行一对象）→ SCF Event 触发 manager-job → 列表/详情/处置。
// Agent 取证与结论落库在 targeted-analysis.runner（job 进程执行）；running 行
// 超过 STALE_RUNNING_MINUTES 无终态时惰性扫荡为 failed，保证任务必有结论。

export const MAX_SUBJECTS_PER_SUBMIT = 10;
export const STALE_RUNNING_MINUTES = 15;

export interface TargetedAnalysisInput {
  realm: string;
  subjectType: 'character' | 'account';
  subjectNames: string[];
  timeFrom: string;
  timeTo: string;
  banContext?: { date?: string; reason?: string; bannedBy?: string };
  operatorId: number;
  operatorName: string;
}

class TargetedAnalysisService {
  // 批量建行 + 触发 Job：同对象同范围已有 running 记录则 409 拒绝；
  // 触发失败时全部置 failed（终态保证），避免永久 running
  async createRecords(input: TargetedAnalysisInput): Promise<AiTargetedAnalysis[]> {
    const names = [...new Set(input.subjectNames.map((n) => n.trim()).filter(Boolean))];
    if (names.length === 0) throw new ServiceError('subjectNames 不能为空', 400);
    if (names.length > MAX_SUBJECTS_PER_SUBMIT) throw new ServiceError(`单次最多提交 ${MAX_SUBJECTS_PER_SUBMIT} 个分析对象`, 400);

    const repo = acmDataSource.getRepository(AiTargetedAnalysis);
    const timeFromDate = new Date(`${input.timeFrom}T00:00:00+08:00`);
    const timeToDate = new Date(`${input.timeTo}T23:59:59+08:00`);
    const running = await repo
      .createQueryBuilder('a')
      .where('a.status = :status', { status: 'running' })
      .andWhere('a.realm = :realm', { realm: input.realm })
      .andWhere('a.subject_type = :subjectType', { subjectType: input.subjectType })
      .andWhere('a.time_from::date = :from', { from: input.timeFrom })
      .andWhere('a.time_to::date = :to', { to: input.timeTo })
      .andWhere('a.subject_name IN (:...names)', { names })
      .getMany();
    if (running.length > 0) {
      throw new ServiceError(`以下对象存在进行中的分析，请等待完成后再提交：${running.map((r) => r.subjectName).join('、')}`, 409);
    }

    const rows = await repo.save(
      names.map((name) =>
        repo.create({
          realm: input.realm,
          subjectType: input.subjectType,
          subjectName: name,
          subjectGuid: null,
          timeFrom: timeFromDate,
          timeTo: timeToDate,
          status: 'running',
          triggeredBy: input.operatorName,
        }),
      ),
    );
    const ids = rows.map((r) => r.id);

    try {
      await triggerJob(JOB_TASK.TARGETED_ANALYSIS, {
        ids,
        meta: Object.fromEntries(
          rows.map((r) => [String(r.id), { timeFrom: input.timeFrom, timeTo: input.timeTo, banContext: input.banContext }]),
        ),
      });
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      await repo
        .update(ids, { status: 'failed', conclusionJson: { error: `Job 触发失败：${message.slice(0, 400)}` } } as any)
        .catch((e: unknown) => logger.error(`[analysis] mark-failed after trigger error: ${(e as Error).message}`));
      throw err;
    }

    await auditLogService.record({
      operatorId: input.operatorId,
      operatorName: input.operatorName,
      operation: 'ai.analysis.create',
      target: `ids:${ids.join(',')}`,
      details: `subjects=${input.subjectType}:${names.join(',')} range=${input.timeFrom}~${input.timeTo} realm=${input.realm}`,
    });
    return rows;
  }

  // 僵尸扫荡：running 超时（Job 崩溃/事件丢失）归档为 failed。web 列表惰性调用 + job 启动兜底调用。
  async sweepStaleRunning(thresholdMinutes = STALE_RUNNING_MINUTES): Promise<number> {
    const cutoff = new Date(Date.now() - thresholdMinutes * 60_000);
    const result = await acmDataSource
      .getRepository(AiTargetedAnalysis)
      .createQueryBuilder()
      .update(AiTargetedAnalysis)
      .set({ status: 'failed', conclusionJson: { error: `分析执行中断或超时（超过 ${thresholdMinutes} 分钟无终态）` } } as any)
      .where('status = :status AND created_at < :cutoff', { status: 'running', cutoff })
      .execute();
    return result.affected ?? 0;
  }

  async list(page = 1, pageSize = 20, subjectName?: string): Promise<{ items: AiTargetedAnalysis[]; total: number }> {
    await this.sweepStaleRunning().catch((err: unknown) =>
      logger.warn(`[analysis] stale sweep failed: ${(err as Error).message}`),
    );
    const repo = acmDataSource.getRepository(AiTargetedAnalysis);
    const qb = repo
      .createQueryBuilder('a')
      .select([
        'a.id',
        'a.realm',
        'a.subjectType',
        'a.subjectName',
        'a.timeFrom',
        'a.timeTo',
        'a.status',
        'a.triggeredBy',
        'a.gmRemark',
        'a.createdAt',
        'a.updatedAt',
      ])
      .orderBy('a.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (subjectName?.trim()) qb.andWhere('a.subject_name LIKE :name', { name: `%${subjectName.trim()}%` });
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getById(id: number): Promise<AiTargetedAnalysis> {
    const row = await acmDataSource.getRepository(AiTargetedAnalysis).findOne({ where: { id } });
    if (!row) throw new ServiceError('定向分析记录不存在', 404);
    return row;
  }

  // 处置备注 / Markdown 润色（T4.7，gmlevel=3）：仅白名单字段，审计记录改动字段清单
  async update(
    id: number,
    patch: { gmRemark?: string; conclusionMarkdown?: string },
    operatorId: number,
    operatorName: string,
  ): Promise<AiTargetedAnalysis> {
    const repo = acmDataSource.getRepository(AiTargetedAnalysis);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new ServiceError('定向分析记录不存在', 404);
    const changes: string[] = [];
    if (patch.gmRemark !== undefined) {
      existing.gmRemark = patch.gmRemark.trim() || null;
      changes.push('gmRemark');
    }
    if (patch.conclusionMarkdown !== undefined) {
      existing.conclusionMarkdown = patch.conclusionMarkdown;
      changes.push('conclusionMarkdown');
    }
    if (changes.length === 0) throw new ServiceError('无可更新字段', 400);
    await repo.save(existing);
    await auditLogService.record({
      operatorId,
      operatorName,
      operation: 'ai.analysis.update',
      target: `id:${id}`,
      details: `subject=${existing.subjectType}:${existing.subjectName} fields=${changes.join(',')}`,
    });
    return existing;
  }

  async remove(id: number, operatorId: number, operatorName: string): Promise<void> {
    const repo = acmDataSource.getRepository(AiTargetedAnalysis);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new ServiceError('定向分析记录不存在', 404);
    await repo.remove(existing);
    await auditLogService.record({
      operatorId,
      operatorName,
      operation: 'ai.analysis.remove',
      target: `id:${id}`,
      details: `subject=${existing.subjectType}:${existing.subjectName} status=${existing.status}`,
    });
  }
}

export const targetedAnalysisService = new TargetedAnalysisService();
