import '@/config/load-env';
import { initializeDataSources } from '@/config/database';
import { registerAllDbTools } from '@/agent/tools/db-tools';
import { exportTools } from '@/agent/tools/registry';

// DB 白名单工具真库冒烟：初始化四数据源后逐个调用 12 个工具，
// 校验 SQL 语法/占位符在真实 MySQL/PG 上可执行（行数可为空，只看是否报错）。
// 用法：npx tsx src/scripts/db-tools-smoke.ts

const CASES: Record<string, Record<string, unknown>> = {
  get_character_overview: { name: '憨憨' },
  get_character_auras: { guid: 1 },
  get_character_associates: { guid: 1 },
  get_money_flow: { guid: 1 },
  get_mail_transfers: { guid: 1 },
  get_auction_activity: { guid: 1 },
  get_account_overview: { accountId: 1 },
  get_login_ip_history: { accountId: 1 },
  get_accounts_by_ip: { ip: '127.0.0.1' },
  get_ban_history: { scope: 'account', id: 1 },
  get_anticheat_record: { guid: 1 },
  get_metrics_snapshot: {},
};

async function main(): Promise<void> {
  await initializeDataSources();
  registerAllDbTools();
  const tools = new Map(exportTools().map((t) => [(t as { name: string }).name, t]));

  let failed = 0;
  for (const [name, args] of Object.entries(CASES)) {
    const wrapped = tools.get(name) as { invoke: (a: unknown) => Promise<unknown> } | undefined;
    if (!wrapped) {
      console.log(`✗ ${name}: not registered`);
      failed++;
      continue;
    }
    try {
      const result = await wrapped.invoke(args);
      console.log(`✓ ${name}:`, JSON.stringify(result).slice(0, 120));
    } catch (err) {
      console.log(`✗ ${name}: ${(err as Error).message}`);
      failed++;
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

void main();
