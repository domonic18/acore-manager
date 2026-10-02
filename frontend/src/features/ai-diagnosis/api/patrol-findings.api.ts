import { apiClient } from '@/shared/api/client';

// 反滥用巡检发现（需求一/二）：战场互刷 + 硬核被带，疑似级落 patrol_findings，
// GM 在违规巡检 tab 人工处置（警告邮件 / 深度分析 / 荣誉调整 / 状态流转）。

export type PatrolFindingType = 'bg_honor_farm' | 'hardcore_carry';
export type PatrolFindingStatus = 'open' | 'actioned' | 'dismissed';

export interface PatrolFindingSubject {
  accountId: number;
  accountName: string;
  characterGuid: number;
  characterName: string;
  level: number;
  hardcore: boolean;
  ip: string;
  extra?: { hardcoreLevel?: number } & Record<string, unknown>;
}

export interface BgFarmEvidence {
  battlegroundId: number;
  battleType: number;
  battleDate: string;
  avgHonorableKills: number;
  avgDeaths: number;
  damagePerKill: number;
  signals: { highHK: boolean; highDeaths: boolean; lowDamage: boolean };
  sameIpAccounts: number;
}

export interface CarryEvidence {
  pairs: Array<{ hardcore: string; main: string; map: number; zone: number; distanceYd: number }>;
  coords: Record<string, { map: number; zone: number; x: number; y: number }>;
}

export interface PatrolFinding {
  id: number;
  findingType: PatrolFindingType;
  realm: string;
  detectedAt: string;
  occurrenceCount: number;
  status: PatrolFindingStatus;
  dedupeKey: string;
  subjectsJson: PatrolFindingSubject[];
  evidenceJson: BgFarmEvidence | CarryEvidence;
  createdAt: string;
  updatedAt: string;
}

export interface PatrolFindingsFilter {
  date: string;
  type?: PatrolFindingType;
  status?: PatrolFindingStatus;
  page?: number;
  pageSize?: number;
}

export const patrolFindingsApi = {
  list: (filter: PatrolFindingsFilter) => {
    const q = new URLSearchParams({ date: filter.date, page: String(filter.page ?? 1), pageSize: String(filter.pageSize ?? 20) });
    if (filter.type) q.set('type', filter.type);
    if (filter.status) q.set('status', filter.status);
    return apiClient.get<{ items: PatrolFinding[]; total: number }>(`/api/ai/analysis/patrol-findings?${q.toString()}`);
  },
  updateStatus: (id: number, status: PatrolFindingStatus) =>
    apiClient.post<PatrolFinding>(`/api/ai/analysis/patrol-findings/${id}/status`, { status }),
};
