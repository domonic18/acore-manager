import { In, IsNull } from 'typeorm';
import { acmDataSource } from '@/config/database';
import { AiAnticheatExemption } from '@/entities/acm/ai-anticheat-exemption.entity';
import { VIOLATION_TYPES } from '@/agent/tools/log-tools/anticheat-parser';
import { auditLogService } from '@/services/audit-log.service';
import { ServiceError } from '@/shared/errors/service-error';

// 误报白名单（arch 4.6）：GM 在报告页标注的反作弊豁免，(guid, type, mapId) 唯一（mapId 可空=不限地图）。
// explain 引擎与 get_anticheat_record 只读此表；写入/移除均记审计。

export { ServiceError };

export interface ExemptionInput {
  characterGuid: number;
  violationType: string;
  mapId?: number | null;
  reason: string;
}

export class AnticheatExemptionService {
  async list(characterGuid?: number): Promise<AiAnticheatExemption[]> {
    const repo = acmDataSource.getRepository(AiAnticheatExemption);
    return repo.find({
      where: characterGuid !== undefined ? { characterGuid } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async listByGuids(guids: number[]): Promise<AiAnticheatExemption[]> {
    if (guids.length === 0) return [];
    return acmDataSource.getRepository(AiAnticheatExemption).find({ where: { characterGuid: In(guids) } });
  }

  async create(input: ExemptionInput, operatorId: number, operatorName: string): Promise<AiAnticheatExemption> {
    if (!(VIOLATION_TYPES as readonly string[]).includes(input.violationType)) {
      throw new ServiceError(`violationType 须为 ${VIOLATION_TYPES.join('/')} 之一`, 400);
    }
    const repo = acmDataSource.getRepository(AiAnticheatExemption);
    const existing = await repo.findOne({
      where: {
        characterGuid: input.characterGuid,
        violationType: input.violationType,
        mapId: input.mapId === undefined || input.mapId === null ? IsNull() : input.mapId,
      },
    });
    let saved: AiAnticheatExemption;
    if (existing) {
      existing.reason = input.reason;
      saved = await repo.save(existing);
    } else {
      saved = await repo.save(
        repo.create({
          characterGuid: input.characterGuid,
          violationType: input.violationType,
          mapId: input.mapId ?? null,
          reason: input.reason,
          createdBy: operatorName,
        }),
      );
    }
    await auditLogService.record({
      operatorId,
      operatorName,
      operation: 'ai.exemption.create',
      target: `guid:${input.characterGuid}`,
      details: `${input.violationType} map=${input.mapId ?? 'all'}：${input.reason}`,
    });
    return saved;
  }

  async remove(id: number, operatorId: number, operatorName: string): Promise<void> {
    const repo = acmDataSource.getRepository(AiAnticheatExemption);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new ServiceError('豁免标注不存在', 404);
    await repo.remove(existing);
    await auditLogService.record({
      operatorId,
      operatorName,
      operation: 'ai.exemption.remove',
      target: `guid:${existing.characterGuid}`,
      details: `${existing.violationType} map=${existing.mapId ?? 'all'}`,
    });
  }
}

export const anticheatExemptionService = new AnticheatExemptionService();
