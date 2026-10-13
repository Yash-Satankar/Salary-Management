import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { requireSession } from './middleware/auth';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler';
import { originCheck } from './middleware/origin-check';
import { createAuthController } from './modules/auth/controller';
import { type LoginRateLimit, protectedAuthRoutes, publicAuthRoutes } from './modules/auth/routes';
import type { AuthService } from './modules/auth/service';
import { healthRoutes } from './modules/health/routes';
import type { ReferenceRepository } from './modules/reference/repository';
import { referenceRoutes } from './modules/reference/routes';

export interface AppConfig {
  allowedOrigins: string[];
  isProduction: boolean;
}

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  authService: AuthService;
  checkDatabase: () => Promise<void>;
  loginRateLimit: LoginRateLimit;
  referenceRepository: ReferenceRepository;
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

  const authController = createAuthController(deps.authService, deps.config.isProduction);

  const api = express.Router();
  api.use(originCheck({ allowedOrigins: deps.config.allowedOrigins }));
  api.use(healthRoutes(deps.checkDatabase));
  api.use(publicAuthRoutes(authController, deps.loginRateLimit));
  // Everything below requires a session, including unknown routes (401 before 404).
  api.use(requireSession(deps.authService));
  api.use(protectedAuthRoutes(authController));
  api.use(referenceRoutes(deps.referenceRepository));
  api.use(notFoundHandler);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(createErrorHandler(deps.logger));
  return app;
}
