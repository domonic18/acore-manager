// MCP 工具的出入参契约（服务端与 agent 共享的唯一真源；前端不复用）

export type BanType = 'account' | 'character';
export type AnalysisSubjectType = 'character' | 'account';
export type AnalysisStatus = 'running' | 'ok' | 'failed';

export interface BanItem {
  accountId: number | null;
  username: string | null;
  characterNames: string | null;
  banType: BanType;
  banDate: string | null;
  banReason: string | null;
  bannedBy: string | null;
  /** 永久封禁（unbandate <= bandate，含 0）→ null */
  unbanDate: string | null;
  lastIp: string | null;
}

export interface ListBansInput {
  page?: number;
  pageSize?: number;
  username?: string;
  characterName?: string;
  banType?: BanType;
}

export interface ListBansResult {
  total: number;
  page: number;
  pageSize: number;
  items: BanItem[];
}

export interface AccountSummary {
  id: number;
  username: string;
  email: string | null;
  lastIp: string | null;
  lastLogin: string | null;
  joinDate: string | null;
  gmlevel: number;
}

export interface BanHistoryItem {
  banDate: string | null;
  unbanDate: string | null;
  bannedBy: string | null;
  banReason: string | null;
  active: number | boolean;
}

export interface CharacterSummary {
  guid: number;
  name: string;
  level: number;
  online: number | boolean;
}

export interface CheckAccountBannedResult {
  found: boolean;
  username: string;
  account: AccountSummary | null;
  banned: boolean;
  activeBans: BanItem[];
  banHistory: BanHistoryItem[];
  characters: CharacterSummary[];
}

export interface CreateTargetedAnalysisInput {
  subjectNames: string[];
  subjectType?: AnalysisSubjectType;
  realm?: string;
  timeFrom?: string;
  timeTo?: string;
  banContext?: { date?: string; reason?: string; bannedBy?: string };
}

export type TimeWindowSource = 'explicit' | 'ban-date' | 'default-7d';

export interface CreateTargetedAnalysisResult {
  timeFrom: string;
  timeTo: string;
  timeWindowSource: TimeWindowSource;
  realm: string;
  banContext: { date?: string; reason?: string; bannedBy?: string } | null;
  items: {
    id: number;
    subjectName: string;
    subjectType: AnalysisSubjectType;
    status: string;
    timeFrom: string;
    timeTo: string;
  }[];
}

export interface ListTargetedAnalysesInput {
  status?: AnalysisStatus;
  subjectName?: string;
  page?: number;
  pageSize?: number;
}

export interface AnalysisListItem {
  id: number;
  realm: string;
  subjectType: AnalysisSubjectType;
  subjectName: string;
  timeFrom: string | null;
  timeTo: string | null;
  status: string;
  hasReport: boolean;
  triggeredBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ListTargetedAnalysesResult {
  total: number;
  page: number;
  pageSize: number;
  items: AnalysisListItem[];
}

export interface GetTargetedAnalysisResult {
  id: number;
  realm: string;
  subjectType: AnalysisSubjectType;
  subjectName: string;
  timeFrom: string | null;
  timeTo: string | null;
  status: string;
  hasReport: boolean;
  /** 失败时为 { error: '...' } */
  conclusion: Record<string, unknown> | null;
  conclusionMarkdown: string | null;
  gmRemark: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
