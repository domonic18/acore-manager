import { z } from 'zod';

// 模型常把 JSON 对象/数组误包成字符串（mimo 事故：content 传 JSON 字符串导致 214 次校验失败），
// 入口层先做无损还原；非 JSON 字符串原样返回，交给后续校验给出带类型的错误提示。
export function coerceJsonString(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return v;
  try {
    return JSON.parse(t);
  } catch {
    return v;
  }
}

// 模型只发现一名玩家时常把单对象当单元素数组传；保持与 sanitizeSuspiciousPlayers 一致的宽容。
export function singleObjectToArray(v: unknown): unknown {
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) return [v];
  return v;
}

export function typeName(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

// zod 框架层错误必须告诉模型「实际收到什么」，否则弱模型会反复以相同形状重试。
export const typeAwareErrorMap: z.ZodErrorMap = (issue, ctx) => {
  if (issue.code === z.ZodIssueCode.invalid_type) {
    return { message: `期望 ${issue.expected}，实际收到 ${issue.received}` };
  }
  return { message: ctx.defaultError };
};

const ServerHealthShape = z
  .object(
    {
      crashes: z.array(z.unknown()).optional().describe('当日崩溃摘要'),
      errors: z.array(z.unknown()).optional().describe('错误统计'),
      authAnomalies: z.array(z.unknown()).optional().describe('认证异常摘要'),
      cheatMarkers: z.array(z.unknown()).optional().describe('server 日志异常标记摘要'),
    },
    { errorMap: typeAwareErrorMap },
  )
  .passthrough();

const normEnum = (v: unknown): unknown => (typeof v === 'string' ? v.trim().toLowerCase() : v);

const SuspiciousPlayerShape = z
  .object(
    {
      character: z.string().describe('角色名（纯名，不带 id/等级/括号注释）'),
      account: z.string().optional().describe('账号名（纯名）'),
      severity: z.preprocess(normEnum, z.enum(['high', 'medium', 'low'])).describe('严重度'),
      suggestedAction: z.preprocess(normEnum, z.enum(['warning', 'investigate', 'ban'])).describe('处置建议'),
      reasons: z.array(z.string()).optional().describe('判定理由'),
      evidence: z.array(z.string()).optional().describe('原始日志摘录（每人 ≤5 条）'),
      falsePositiveSignals: z.array(z.unknown()).optional().describe('误报信号，非空时禁止 ban'),
      suggestion: z.string().optional().describe('人工审核建议（含地图轨迹叙事）'),
      profile: z.string().optional().describe('画像摘要：游戏时长 x 小时 · 等级 x · 账号注册 N 天'),
    },
    { errorMap: typeAwareErrorMap },
  )
  .passthrough();

const SuspiciousPlayersShape = z.preprocess(
  singleObjectToArray,
  z.array(SuspiciousPlayerShape, { errorMap: typeAwareErrorMap }),
);

const RecommendationsShape = z.preprocess(
  (v) => (typeof v === 'string' ? v.split('\n').map((s) => s.trim()).filter((s) => s.length > 0) : v),
  z.array(z.string(), { errorMap: typeAwareErrorMap }),
);

export const ServerHealthArgSchema = z.object({
  content: z.preprocess(coerceJsonString, ServerHealthShape, { errorMap: typeAwareErrorMap }),
});

export const SuspiciousPlayersArgSchema = z.object({
  content: z.preprocess(coerceJsonString, SuspiciousPlayersShape, { errorMap: typeAwareErrorMap }),
});

export const RecommendationsArgSchema = z.object({
  content: z.preprocess(coerceJsonString, RecommendationsShape, { errorMap: typeAwareErrorMap }),
});
