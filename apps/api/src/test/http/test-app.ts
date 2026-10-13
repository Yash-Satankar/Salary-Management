import { pino } from 'pino';
import { type AppDeps, createApp } from '../../app';
import type { AuthService } from '../../modules/auth/service';

export const TEST_ORIGIN = 'http://localhost:3000';
export const VALID_CREDENTIALS = { email: 'hr@acme.test', password: 'correct-password' };
const VALID_TOKEN = 'valid-session-token';
export const SESSION_COOKIE = `acme_session=${VALID_TOKEN}`;

/** In-memory stand-in: one fixed credential pair and one fixed token. */
export function fakeAuthService(): AuthService {
  return {
    login: async (email, password) =>
      email === VALID_CREDENTIALS.email && password === VALID_CREDENTIALS.password
        ? VALID_TOKEN
        : null,
    verifySession: async (token) =>
      token === VALID_TOKEN ? { email: VALID_CREDENTIALS.email } : null,
  };
}

export function testDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    config: { allowedOrigins: [TEST_ORIGIN], isProduction: false },
    logger: pino({ level: 'silent' }),
    authService: fakeAuthService(),
    checkDatabase: async () => undefined,
    loginRateLimit: { windowMs: 60_000, limit: 5 },
    ...overrides,
  };
}

export function buildTestApp(overrides: Partial<AppDeps> = {}) {
  return createApp(testDeps(overrides));
}
