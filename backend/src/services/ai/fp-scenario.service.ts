import { IsNull } from 'typeorm';
import { acmDataSource } from '@/config/database';
import { AiFpScenario } from '@/entities/acm/ai-fp-scenario.entity';
import { VIOLATION_TYPES } from '@/agent/tools/log-tools/anticheat-parser';
import { auditLogService } from '@/services/audit-log.service';
import { ServiceError } from '@/shared/errors/service-error';

// 误报场景库（巡查优化 2026-10）：任务传送点/已知几何误报场景，(mapId, violationType, questId) 唯一。
// explain 引擎（parse-tool annotateFalsePositives）只读此表产出 quest/map 强信号；管理走样本与场景库页。

export interface FpScenarioInput {
  mapId?: number | null;
  violationType: string;
  questId?: number | null;
  spots?: { x: number; y: number; z: number; radiusYards: number }[] | null;
  reason: string;
}

function validateSpots(spots: FpScenarioInput['spots']): void {
  if (spots === undefined || spots === null) return;
  if (!Array.isArray(spots) || spots.length === 0 || spots.length > 20) {
    throw new ServiceError('spots 须为 1-20 个坐标点数组', 400);
  }
  for (const s of spots) {
    if (
      typeof s !== 'object' ||
      s === null ||
      !Number.isFinite(s.x) ||
      !Number.isFinite(s.y) ||
      !Number.isFinite(s.z) ||
      !Number.isFinite(s.radiusYards) ||
      s.radiusYards <= 0
    ) {
      throw new ServiceError('spots 每项须为 {x, y, z, radiusYards} 数字对象且 radiusYards > 0', 400);
    }
  }
}

export class FpScenarioService {
  async list(): Promise<AiFpScenario[]> {
    return acmDataSource.getRepository(AiFpScenario).find({ order: { id: 'DESC' } });
  }

  async create(input: FpScenarioInput, operatorId: number, operatorName: string): Promise<AiFpScenario> {
    this.validateType(input.violationType);
    validateSpots(input.spots);
    const repo = acmDataSource.getRepository(AiFpScenario);
    const existing = await repo.findOne({
      where: {
        mapId: input.mapId === undefined || input.mapId === null ? IsNull() : input.mapId,
        violationType: input.violationType,
        questId: input.questId === undefined || input.questId === null ? IsNull() : input.questId,
      },
    });
    let saved: AiFpScenario;
    if (existing) {
      existing.questId = input.questId ?? null;
      existing.spots = input.spots ?? null;
      existing.reason = input.reason;
      saved = await repo.save(existing);
    } else {
      saved = await repo.save(
        repo.create({
          mapId: input.mapId ?? null,
          violationType: input.violationType,
          questId: input.questId ?? null,
          spots: input.spots ?? null,
          reason: input.reason,
          createdBy: operatorName,
        }),
      );
    }
    await auditLogService.record({
      operatorId,
      operatorName,
      operation: 'ai.fp-scenario.create',
      target: `scenario:${saved.id}`,
      details: `${input.violationType} map=${input.mapId ?? 'all'} quest=${input.questId ?? '-'}：${input.reason}`,
    });
    return saved;
  }

  async update(id: number, input: Partial<FpScenarioInput>, operatorId: number, operatorName: string): Promise<AiFpScenario> {
    const repo = acmDataSource.getRepository(AiFpScenario);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new ServiceError('误报场景不存在', 404);
    if (input.violationType !== undefined) {
      this.validateType(input.violationType);
      existing.violationType = input.violationType;
    }
    if (input.mapId !== undefined) existing.mapId = input.mapId;
    if (input.questId !== undefined) existing.questId = input.questId;
    if (input.spots !== undefined) {
      validateSpots(input.spots);
      existing.spots = input.spots;
    }
    if (input.reason !== undefined) existing.reason = input.reason;
    const saved = await repo.save(existing);
    await auditLogService.record({
      operatorId,
      operatorName,
      operation: 'ai.fp-scenario.update',
      target: `scenario:${id}`,
      details: `${saved.violationType} map=${saved.mapId ?? 'all'} quest=${saved.questId ?? '-'}`,
    });
    return saved;
  }

  async remove(id: number, operatorId: number, operatorName: string): Promise<void> {
    const repo = acmDataSource.getRepository(AiFpScenario);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new ServiceError('误报场景不存在', 404);
    await repo.remove(existing);
    await auditLogService.record({
      operatorId,
      operatorName,
      operation: 'ai.fp-scenario.remove',
      target: `scenario:${id}`,
      details: `${existing.violationType} map=${existing.mapId ?? 'all'} quest=${existing.questId ?? '-'}`,
    });
  }

  private validateType(violationType: string): void {
    if (!(VIOLATION_TYPES as readonly string[]).includes(violationType)) {
      throw new ServiceError(`violationType 须为 ${VIOLATION_TYPES.join('/')} 之一`, 400);
    }
  }
}

export const fpScenarioService = new FpScenarioService();
