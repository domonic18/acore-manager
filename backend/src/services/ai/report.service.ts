import { acmDataSource } from '@/config/database';
import { AiReport } from '@/entities/acm/ai-report.entity';
import { cosGetObjectJson } from '@/shared/utils/cos.util';
import { LOG_TYPES, manifestKey } from '@/agent/tools/log-tools/log-workspace';
import { yesterdayCST } from '@/shared/utils/cst-date.util';
import { auditLogService } from '@/services/audit-log.service';
import { auditLogRepository } from '@/repositories/audit-log.repository';
import { characterRepository } from '@/repositories/character.repository';
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
    const report = await acmDataSource.getRepository(AiReport).findOne({ where: { realm, reportDate: date } });
    if (!report) return null;
    return this.enrichSuspiciousPlayers(report);
  }

  // 响应层富化（T4.3/T4.5）：为可疑玩家补充 guid/账号信息供前端跳转、"已警告"标注（查审计记录），
  // 仅注入返回值，不写回 contentJson
  private async enrichSuspiciousPlayers(report: AiReport): Promise<AiReport> {
    const players = (report.contentJson as { suspiciousPlayers?: { character: string }[] } | null)?.suspiciousPlayers;
    if (!Array.isArray(players) || players.length === 0) return report;
    const names = [...new Set(players.map((p) => p.character).filter(Boolean))];
    if (names.length === 0) return report;
    let basics: { guid: number; name: string; accountId: number; accountUsername: string | null; online: number }[] = [];
    try {
      basics = await characterRepository.findBasicByNames(names);
    } catch {
      return report; // 角色库查询失败不阻塞报告展示，降级纯文本
    }
    const byName = new Map(basics.map((b) => [b.name, b]));
    const guids = basics.map((b) => `guid:${b.guid}`);
    let warnedTargets: Set<string> | null = null;
    if (guids.length > 0) {
      try {
        const rows = await auditLogRepository.listByOperationAndTargets('gmtool.mail.send', guids);
        warnedTargets = new Set(rows.map((r) => r.target));
      } catch {
        warnedTargets = null; // 审计查询失败只影响徽标，不阻塞报告
      }
    }
    report.contentJson = {
      ...report.contentJson,
      suspiciousPlayers: players.map((p) => {
        const b = byName.get(p.character);
        if (!b) return p;
        return {
          ...p,
          characterGuid: b.guid,
          accountId: b.accountId,
          accountUsername: b.accountUsername ?? undefined,
          warned: warnedTargets?.has(`guid:${b.guid}`) ?? undefined,
        };
      }),
    } as any;
    return report;
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
