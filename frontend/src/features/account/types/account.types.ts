export interface AccountListItem {
  id: number;
  username: string;
  email: string;
  gmlevel: number;
  online: number;
  lastLogin: Date | null;
  lastIp: string;
  locked: number;
}

export interface BanRecord {
  banDate: Date;
  unbanDate: Date;
  bannedBy: string;
  banReason: string;
  active: number;
}

export interface AccountDetail extends AccountListItem {
  joinDate: Date;
  failedLogins: number;
  muteTime: number;
  muteReason: string;
  totalTime: number;
  bans: BanRecord[];
}

export interface AccountListResult {
  items: AccountListItem[];
  total: number;
  page: number;
  pageSize: number;
}
