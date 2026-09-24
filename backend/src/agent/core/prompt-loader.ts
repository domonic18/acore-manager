import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

// 系统提示词加载：agent/prompts/{scene}.yaml，文档结构 { system: 多行文本 }。
// 提示词随代码走 dist（build 脚本负责拷贝 YAML），场景缺失视为装配错误直接抛出。
const PROMPTS_DIR = join(__dirname, '..', 'prompts');

interface PromptDoc {
  system?: string;
}

export function loadPrompt(scene: string): string {
  const file = join(PROMPTS_DIR, `${scene}.yaml`);
  if (!existsSync(file)) throw new Error(`system prompt not found: ${file}`);
  const doc = yaml.load(readFileSync(file, 'utf8')) as PromptDoc;
  if (!doc?.system || typeof doc.system !== 'string') {
    throw new Error(`system prompt "${scene}.yaml" must contain a non-empty "system" field`);
  }
  return doc.system;
}
