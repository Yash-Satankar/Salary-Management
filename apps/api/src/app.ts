import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler';
import type { AuthService } from './modules/auth/service';
import { healthRoutes } from './modules/health/routes';

export interface AppConfig {
  allowedOrigins: string[];
  isProduction: boolean;
}

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  authService: AuthService;
  checkDatabase: () => Promise<void>;
  loginRateLimit: { windowMs: number; limit: number };
}

/** Pure wiring: no listen(), no env access, so tests can build the app with fakes. */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  // Render and Vercel sit in front of the API; trust exactly one proxy hop for client IPs.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(pinoHttp({ logger: deps.logger }));
  app.use(express.json({ limit: '100kb' }));

  const api = express.Router();
  api.use(healthRoutes(deps.checkDatabase));
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(createErrorHandler(deps.logger));
  return app;
}
