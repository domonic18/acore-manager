export enum GmLevel {
  Moderator = 1,
  GameMaster = 2,
  Admin = 3,
  Owner = 4,
}

export const GmLevelLabels: Record<number, string> = {
  [GmLevel.Moderator]: '初级 GM',
  [GmLevel.GameMaster]: '游戏管理员',
  [GmLevel.Admin]: '管理员',
  [GmLevel.Owner]: '超级管理员',
};
