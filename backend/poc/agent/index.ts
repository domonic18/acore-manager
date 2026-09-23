import './env';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { createDeepAgent } from 'deepagents';
import { HumanMessage } from '@langchain/core/messages';
import { Pool } from 'pg';
import { acmDataSource } from '../../src/config/database';
import { resolveDefaultLlmConfig } from './resolve-config';
import { createCheckpointer, closeCheckpointer } from './checkpointer';
import { pocTools } from './tools';

// T0.3 deepagents JS PoC 主流程：
//   默认模式  —— 库配置 → 按协议构建模型（openai→ChatOpenAI / anthropic→ChatAnthropic）
//                → createDeepAgent → poc-1 两轮对话（工具调用 + 记忆）
//                → poc-2 streamEvents 事件类型采集（SSE 映射可行性）→ PG checkpoint 行观测
//   resume 模式 —— 全新进程仅问第 3 轮问题，验证 checkpoint 跨进程持久化
const THREAD_MAIN = 'poc-1';
const THREAD_STREAM = 'poc-2';

const SYSTEM_PROMPT = [
  '你是 ACM（AzerothCore Manager）的 GM 助手 PoC。',
  '回答简洁；需要回显或时间信息时调用对应工具，不要凭空编造。',
].join('\n');

async function buildAgent() {
  const cfg = await resolveDefaultLlmConfig();
  console.log(`[config] #${cfg.id} ${cfg.name} provider=${cfg.provider} protocol=${cfg.protocol}`);
  console.log(`[config] model=${cfg.modelName} baseUrl=${cfg.baseUrl} key=${cfg.apiKey.slice(0, 4)}****`);

  const common = {
    temperature: cfg.temperature ?? undefined,
    maxTokens: cfg.maxTokens ?? undefined,
  };
  const model =
    cfg.protocol === 'anthropic'
      ? new ChatAnthropic({
          model: cfg.modelName,
          apiKey: cfg.apiKey,
          anthropicApiUrl: cfg.baseUrl.replace(/\/+$/, ''),
          ...common,
        })
      : new ChatOpenAI({
          model: cfg.modelName,
          apiKey: cfg.apiKey,
          configuration: { baseURL: cfg.baseUrl },
          ...common,
        });

  const checkpointer = await createCheckpointer();
  const agent = createDeepAgent({ model, tools: pocTools, systemPrompt: SYSTEM_PROMPT, checkpointer });
  return { agent };
}

async function runTurn(
  agent: ReturnType<typeof createDeepAgent>,
  threadId: string,
  text: string,
): Promise<string> {
  console.log(`\n[thread ${threadId}] user: ${text}`);
  const result = await agent.invoke(
    { messages: [new HumanMessage(text)] },
    { configurable: { thread_id: threadId } },
  );
  const last = result.messages[result.messages.length - 1];
  const content = typeof last.content === 'string' ? last.content : JSON.stringify(last.content);
  console.log(`[thread ${threadId}] assistant: ${content}`);
  return content;
}

async function collectStreamEventTypes(
  agent: ReturnType<typeof createDeepAgent>,
): Promise<void> {
  console.log(`\n[streamEvents] thread=${THREAD_STREAM} 采集事件类型（SSE 映射可行性）...`);
  const counts = new Map<string, number>();
  const stream = agent.streamEvents(
    { messages: [new HumanMessage('调用 get_server_time 工具告诉我现在的时间，并用一句话概括。')] },
    { version: 'v2', configurable: { thread_id: THREAD_STREAM } },
  );
  for await (const event of stream) {
    counts.set(event.event, (counts.get(event.event) ?? 0) + 1);
  }
  console.log('[streamEvents] 事件类型统计:');
  for (const [name, n] of [...counts.entries()].sort()) console.log(`  - ${name} x${n}`);
}

async function inspectCheckpointRows(): Promise<void> {
  const url = process.env.ACM_DB_URL;
  if (!url) throw new Error('missing ACM_DB_URL');
  const pg = new Pool({ connectionString: url, max: 1 });
  try {
    const { rows: threads } = await pg.query<{ thread_id: string; checkpoints: string }>(
      'SELECT thread_id, COUNT(*)::text AS checkpoints FROM checkpoints GROUP BY thread_id ORDER BY thread_id',
    );
    console.log('\n[pg] checkpoint 表按 thread 统计:');
    for (const t of threads) console.log(`  - thread=${t.thread_id} checkpoints=${t.checkpoints}`);
    const { rows: latest } = await pg.query<{ thread_id: string; checkpoint_id: string; ts: string }>(
      `SELECT thread_id, checkpoint_id, checkpoint->>'ts' AS ts
         FROM checkpoints ORDER BY checkpoint->>'ts' DESC LIMIT 5`,
    );
    console.log('[pg] 最近 checkpoint:');
    for (const r of latest) console.log(`  - ${r.thread_id} @ ${new Date(r.ts).toISOString()}`);
  } finally {
    await pg.end();
  }
}

async function main(): Promise<void> {
  const resume = process.argv[2] === 'resume';
  const { agent } = await buildAgent();
  try {
    if (resume) {
      console.log('\n=== resume 模式：全新进程，验证跨进程持久化 ===');
      await runTurn(
        agent,
        THREAD_MAIN,
        '不调用任何工具，直接回答：本次对话最早一轮我让你用 echo 工具回显的字符串是什么？',
      );
    } else {
      console.log('\n=== 默认模式：两轮对话 + 工具调用 + 记忆 ===');
      await runTurn(
        agent,
        THREAD_MAIN,
        "请调用 echo 工具，把字符串 'acm-poc-2026' 原样传给它，并告诉我工具返回了什么。",
      );
      await runTurn(agent, THREAD_MAIN, '我上一轮让你回显的字符串是什么？不要调用工具。');
      await collectStreamEventTypes(agent);
      await inspectCheckpointRows();
    }
  } finally {
    await closeCheckpointer();
    if (acmDataSource.isInitialized) await acmDataSource.destroy();
  }
}

main().catch((err) => {
  console.error('poc failed:', err?.message ?? err);
  process.exit(1);
});
