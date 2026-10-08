import { acmDataSource } from '@/config/database';
import { AiInspectionSample } from '@/entities/acm/ai-inspection-sample.entity';
import { auditLogService } from '@/services/audit-log.service';
import { ServiceError } from '@/shared/errors/service-error';

// 巡查样本库（巡查优化 2026-10）：生产确认的作弊/误报标注语料（goodcase/badcase），
// 用于回归评测与提示词校准；label 流转 pending→cheat/false_positive，全部写操作记审计。

const LABELS = ['cheat', 'false_positive', 'pending'] as const;
const SOURCES = ['auto_ban', 'appeal', 'deep_analysis', 'inspection', 'gm'] as const;
const MAX_LIST = 200;

export interface SampleInput {
  realm: string;
  characterGuid?: number | null;
  characterName: string;
  label: (typeof LABELS)[number];
  source: (typeof SOURCES)[number];
  detectedDate?: string | null;
  summary: string;
  evidence?: { source: string; quote: string }[];
  refUrl?: string | null;
}

function validateLabel(label: string): void {
  if (!(LABELS as readonly string[]).includes(label)) {
    throw new ServiceError(`label 须为 ${LABELS.join('/')} 之一`, 400);
  }
}

function validateSource(source: string): void {
  if (!(SOURCES as readonly string[]).includes(source)) {
    throw new ServiceError(`source 须为 ${SOURCES.join('/')} 之一`, 400);
  }
}

function validateEvidence(evidence: SampleInput['evidence']): void {
  if (evidence === undefined || evidence === null) return;
  if (!Array.isArray(evidence) || evidence.length > 50) {
    throw new ServiceError('evidence 须为 ≤50 条的数组', 400);
  }
  for (const e of evidence) {
    if (typeof e !== 'object' || e === null || typeof e.source !== 'string' || typeof e.quote !== 'string') {
      throw new ServiceError('evidence 每项须为 {source, quote} 字符串对象', 400);
    }
  }
}

export class InspectionSampleService {
  async list(filters: { label?: string; realm?: string; q?: string } = {}): Promise<AiInspectionSample[]> {
    const repo = acmDataSource.getRepository(AiInspectionSample);
    const qb = repo.createQueryBuilder('s');
    if (filters.label) qb.andWhere('s.label = :label', { label: filters.label });
    if (filters.realm) qb.andWhere('s.realm = :realm', { realm: filters.realm });
    if (filters.q) qb.andWhere('(s.characterName ILIKE :q OR s.summary ILIKE :q)', { q: `%${filters.q}%` });
    return qb.orderBy('s.createdAt', 'DESC').take(MAX_LIST).getMany();
  }

  async create(input: SampleInput, operatorId: number, operatorName: string): Promise<AiInspectionSample> {
    validateLabel(input.label);
    validateSource(input.source);
    validateEvidence(input.evidence);
    const saved = await acmDataSource.getRepository(AiInspectionSample).save(
      acmDataSource.getRepository(AiInspectionSample).create({
        realm: input.realm,
        characterGuid: input.characterGuid ?? null,
        characterName: input.characterName,
        label: input.label,
        source: input.source,
        detectedDate: input.detectedDate ?? null,
        summary: input.summary,
        evidenceJson: input.evidence ?? [],
        refUrl: input.refUrl ?? null,
        createdBy: operatorName,
      }),
    );
    await auditLogService.record({
      operatorId,
      operatorName,
      operation: 'ai.sample.create',
      target: `sample:${saved.id}`,
      details: `${input.characterName}(${input.realm}) ${input.source}/${input.label}：${input.summary.slice(0, 120)}`,
    });
    return saved;
  }

  async update(id: number, input: Partial<SampleInput>, operatorId: number, operatorName: string): Promise<AiInspectionSample> {
    const repo = acmDataSource.getRepository(AiInspectionSample);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new ServiceError('样本不存在', 404);
    if (input.label !== undefined) {
      validateLabel(input.label);
      existing.label = input.label;
    }
    if (input.source !== undefined) {
      validateSource(input.source);
      existing.source = input.source;
    }
    if (input.realm !== undefined) existing.realm = input.realm;
    if (input.characterGuid !== undefined) existing.characterGuid = input.characterGuid;
    if (input.characterName !== undefined) existing.characterName = input.characterName;
    if (input.detectedDate !== undefined) existing.detectedDate = input.detectedDate;
    if (input.summary !== undefined) existing.summary = input.summary;
    if (input.evidence !== undefined) {
      validateEvidence(input.evidence);
      existing.evidenceJson = input.evidence;
    }
    if (input.refUrl !== undefined) existing.refUrl = input.refUrl;
    const saved = await repo.save(existing);
    await auditLogService.record({
      operatorId,
      operatorName,
      operation: 'ai.sample.update',
      target: `sample:${id}`,
      details: `${saved.characterName}(${saved.realm}) ${saved.source}/${saved.label}`,
    });
    return saved;
  }

  async remove(id: number, operatorId: number, operatorName: string): Promise<void> {
    const repo = acmDataSource.getRepository(AiInspectionSample);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new ServiceError('样本不存在', 404);
    await repo.remove(existing);
    await auditLogService.record({
      operatorId,
      operatorName,
      operation: 'ai.sample.remove',
      target: `sample:${id}`,
      details: `${existing.characterName}(${existing.realm}) ${existing.source}/${existing.label}`,
    });
  }
}

export const inspectionSampleService = new InspectionSampleService();
