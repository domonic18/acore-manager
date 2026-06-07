import 'reflect-metadata';
import 'dotenv/config';
import { createApp } from './app';
import { initializeDataSourcesWithRetry } from './config/database';
import { env } from './config/env';
import { logger } from './middleware/request-logger';

const PORT = env.PORT;

const app = createApp();
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server listening on port ${PORT} / 服务器监听端口 ${PORT}`);
});

// 后台异步连接数据库，失败不阻塞服务启动
initializeDataSourcesWithRetry().catch((err) => {
  logger.error(err, 'Background database initialization failed / 后台数据库初始化失败');
});
