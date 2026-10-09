import { apiClient } from '@/shared/api/client';

// 提示词库前端 API（只读）：场景提示词（后端 agent/prompts/*.yaml）+ 技能文档全量返回，
// 页面做客户端搜索与展示；提示词修改走仓库 git 提交，无任何写接口。

export interface PromptSection {
  key: string;
  label: string;
  content: string;
}

export interface PromptScene {
  scene: string;
  description: string;
  sections: PromptSection[];
  sourcePath: string;
  updatedAt: string;
}

export interface SkillDoc {
  name: string;
  content: string;
}

export interface PromptLibraryPayload {
  scenes: PromptScene[];
  skills: SkillDoc[];
}

export const promptLibraryApi = {
  get: () => apiClient.get<PromptLibraryPayload>('/api/ai/prompts'),
};
