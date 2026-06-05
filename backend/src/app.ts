import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { env } from './config/env';
import { requestLogger } from './middleware/request-logger';
import { responseFormatter } from './middleware/response-formatter';
import { errorHandler } from './middleware/error-handler';
import authRoutes from './routes/auth.routes';
import accountRoutes from './routes/account.routes';
import characterRoutes from './routes/character.routes';
import transactionRoutes from './routes/transaction.routes';
import gmToolRoutes from './routes/gm-tool.routes';
import auditLogRoutes from './routes/audit-log.routes';
import dashboardRoutes from './routes/dashboard.routes';
import healthRoutes from './routes/health.routes';

export function createApp(): Application {
  const app = express();

  app.use(helmet());
  const allowedOrigins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',') : [];
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        callback(null, origin || '*');
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(requestLogger);
  app.use(responseFormatter);

  app.use('/api/auth', authRoutes);
  app.use('/api/accounts', accountRoutes);
  app.use('/api/characters', characterRoutes);
  app.use('/api/transactions', transactionRoutes);
  app.use('/api/gm', gmToolRoutes);
  app.use('/api/audit', auditLogRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/health', healthRoutes);

  const publicPath = path.join(__dirname, 'public');
  app.use(express.static(publicPath));

  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  app.use(errorHandler);

  return app;
}
