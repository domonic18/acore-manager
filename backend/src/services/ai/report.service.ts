import { acmDataSource } from '@/config/database';
import { AiReport } from '@/entities/acm/ai-report.entity';
import { cosGetObjectJson } from '@/shared/utils/cos.util';
import { LOG_TYPES, manifestKey } from '@/agent/tools/log-tools/log-workspace';
import { yesterdayCST } from '@/shared/utils/cst-date.util';
import { auditLogService } from '@/services/audit-log.service';
import { ServiceError } from './anticheat-exemption.service';

// 报告查询与管理（T4.1/T4.7 前置，arch 4.2 报告页数据源）：列表（摘要列）/ 详情（全量 JSON+Markdown）/
// 近 N 天 COS 日志上传状态 / 删除（gmlevel=3，审计）。巡检写路径在 inspection.service。

export interface UploadStatusDay {
  date: string;
  present: boolean;
  missingTypes: string[];
}

export class ReportService {
  async list(realm?: string, limit = 100): Promise<AiReport[]> {
    const repo = acmDataSource.getRepository(AiReport);
    return repo.find({
      select: ['id', 'realm', 'reportDate', 'healthScore', 'summary', 'status', 'generatedBy', 'gmRemark', 'updatedAt'],
      where: realm ? { realm } : {},
      order: { reportDate: 'DESC' },
      take: Math.min(limit, 100),
    });
  }

  async getByRealmDate(realm: string, date: string): Promise<AiReport | null> {
    return acmDataSource.getRepository(AiReport).findOne({ where: { realm, reportDate: date } });
  }

  async remove(realm: string, date: string, operatorId: number, operatorName: string): Promise<void> {
    const repo = acmDataSource.getRepository(AiReport);
    const existing = await repo.findOne({ where: { realm, reportDate: date } });
    if (!existing) throw new ServiceError('报告不存在', 404);
    await repo.remove(existing);
    await auditLogService.record({
      operatorId,
      operatorName,
      operation: 'ai.report.remove',
      target: `${realm}:${date}`,
      details: `healthScore=${existing.healthScore} status=${existing.status} generatedBy=${existing.generatedBy}`,
    });
  }

  // manifest 读取失败视为未上传（与巡检断传检查同语义，不让 COS 故障打断查询）
  async uploadStatus(realm: string, days = 7): Promise<UploadStatusDay[]> {
    const anchor = yesterdayCST();
    const result: UploadStatusDay[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(`${anchor}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - i);
      const day = date.toISOString().slice(0, 10);
      try {
        const manifest = await cosGetObjectJson<{ files?: { type: string }[] }>(manifestKey(realm, day));
        const present = new Set((manifest?.files ?? []).map((f) => f.type));
        result.push({ date: day, present: present.size > 0, missingTypes: LOG_TYPES.filter((t) => !present.has(t)) });
      } catch {
        result.push({ date: day, present: false, missingTypes: [...LOG_TYPES] });
      }
    }
    return result;
  }
}

export const reportService = new ReportService();
