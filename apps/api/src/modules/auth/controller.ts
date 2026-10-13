import { loginRequestSchema } from '@acme/shared';
import type { CookieOptions, RequestHandler } from 'express';
import { unauthenticated } from '../../lib/errors';
import { sendData } from '../../lib/http';
import { SESSION_COOKIE_NAME } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { type AuthService, SESSION_TTL_SECONDS } from './service';

export interface AuthController {
  login: RequestHandler;
  logout: RequestHandler;
  me: RequestHandler;
}

export function createAuthController(
  authService: AuthService,
  isProduction: boolean,
): AuthController {
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: isProduction,
  };

  return {
    login: validate({ body: loginRequestSchema }, async ({ body }, _req, res) => {
      const token = await authService.login(body.email, body.password);
      if (!token) {
        // One message for every failure, so the response never confirms which part was wrong.
        throw unauthenticated('Invalid email or password');
      }
      res.cookie(SESSION_COOKIE_NAME, token, {
        ...cookieOptions,
        maxAge: SESSION_TTL_SECONDS * 1000,
      });
      res.status(204).end();
    }),

    logout: (_req, res) => {
      res.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
      res.status(204).end();
    },

    me: (_req, res) => {
      sendData(res, { email: res.locals.session?.email });
    },
  };
}
