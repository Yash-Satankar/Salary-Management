import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { rateLimited } from '../../lib/errors';
import type { AuthController } from './controller';

export interface LoginRateLimit {
  windowMs: number;
  limit: number;
}

/** Login and logout must work without a session. */
export function publicAuthRoutes(
  controller: AuthController,
  loginRateLimit: LoginRateLimit,
): Router {
  const router = Router();
  const loginLimiter = rateLimit({
    ...loginRateLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(rateLimited('Too many login attempts, please wait a minute')),
  });
  router.post('/auth/login', loginLimiter, controller.login);
  router.post('/auth/logout', controller.logout);
  return router;
}

export function protectedAuthRoutes(controller: AuthController): Router {
  const router = Router();
  router.get('/auth/me', controller.me);
  return router;
}
