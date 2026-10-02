import { apiClient } from './client';

// 荣誉调整（配合 warden-honor.lua 伪命令）：SOAP `.wardenhonor`，仅对在线玩家生效。
// 消费方：ai-diagnosis（违规巡检处置）与 character（角色详情操作区），故置于 shared。

export type HonorAdjustMode = 'set' | 'sub';

export interface HonorAdjustResult {
  name: string;
  ok: boolean;
  message: string;
}

export const honorAdjustApi = {
  adjust: (input: { characterName: string; mode: HonorAdjustMode; value: number; reason?: string }) =>
    apiClient.post<HonorAdjustResult>('/api/gm/honor-adjust', input),
};
