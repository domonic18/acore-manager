import './env';
import { IsNull, Not } from 'typeorm';
import { acmDataSource } from '../../src/config/database';
import { AiModelConfig } from '../../src/entities/acm/ai-model-config.entity';
import { encryptToken } from '../../src/shared/utils/aes.util';

// 模型配置种子脚本（模拟 gmlevel=4 管理员在 UI 中的"新增模型"操作）：
//   npx tsx poc/agent/seed-model-config.ts --api-key=<GLM Key> [--name glm-flash] [--model glm-4.6]
// api_key 仅经命令行一次性传入，AES 加密后入库，不落任何文件/环境变量。
function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main(): Promise<void> {
  const apiKey = arg('api-key');
  if (!apiKey) throw new Error('missing --api-key=<your GLM api key>');

  const values = {
    name: arg('name') ?? 'glm-flash',
    provider: arg('provider') ?? 'zhipu',
    protocol: arg('protocol') ?? 'openai',
    baseUrl: arg('base-url') ?? 'https://open.bigmodel.cn/api/paas/v4',
    modelName: arg('model') ?? 'glm-4.6',
    apiKeyEncrypted: encryptToken(apiKey),
    isDefault: true,
    isActive: true,
    createdBy: 'poc-seed',
  };

  await acmDataSource.initialize();
  const repo = acmDataSource.getRepository(AiModelConfig);
  // 设默认语义（参考 ai-invest-assisstant）：清除其他默认行
  await repo.update({ isDefault: true }, { isDefault: false });
  const existing = await repo.findOneBy({ name: values.name });
  if (existing) {
    await repo.update(existing.id, values);
    console.log(`updated model config: ${values.name} (#${existing.id})`);
  } else {
    const row = await repo.save(repo.create(values));
    console.log(`inserted model config: ${values.name} (#${row.id})`);
  }
  const total = await repo.countBy({ isDefault: Not(IsNull()) });
  console.log('default config rows:', total);
  await acmDataSource.destroy();
}

main().catch((err) => {
  console.error('seed failed:', err.message ?? err);
  process.exit(1);
});
