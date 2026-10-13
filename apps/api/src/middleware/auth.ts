import type { RequestHandler } from 'express';
import { readCookie } from '../lib/cookies';
import { unauthenticated } from '../lib/errors';
import type { AuthService, Session } from '../modules/auth/service';

export const SESSION_COOKIE_NAME = 'acme_session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express only exposes Locals via this namespace
  namespace Express {
    interface Locals {
      session?: Session;
    }
  }
}

/** The API is the real enforcement point; the web middleware only improves the UX. */
export function requireSession(authService: AuthService): RequestHandler {
  return async (req, res, next) => {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE_NAME);
    const session = token ? await authService.verifySession(token) : null;
    if (!session) {
      throw unauthenticated();
    }
    res.locals.session = session;
    next();
  };
}
