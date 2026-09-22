import { config } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

// 依次加载（先加载的不被覆盖）：backend/.env.local（本地开发）→ backend/.env → 仓库根 .env（容器部署约定）
const candidates = [
  join(__dirname, '..', '..', '.env.local'),
  join(__dirname, '..', '..', '.env'),
  join(__dirname, '..', '..', '..', '.env'),
];
for (const path of candidates) {
  if (existsSync(path)) config({ path });
}
