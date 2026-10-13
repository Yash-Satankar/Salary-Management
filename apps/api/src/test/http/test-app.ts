import { pino } from 'pino';
import { type AppDeps, createApp } from '../../app';
import type { AuthService } from '../../modules/auth/service';
import { fixedClock } from '../../lib/clock';
import { createEmployeeService } from '../../modules/employees/service';
import { InMemoryEmployeeRepository } from '../fakes/employees';
import { emptyInsightsRepository } from '../fakes/insights';
import { fakeReferenceRepository } from '../fakes/reference';

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
  const employeeRepository = new InMemoryEmployeeRepository();
  return {
    config: { allowedOrigins: [TEST_ORIGIN], isProduction: false },
    logger: pino({ level: 'silent' }),
    authService: fakeAuthService(),
    checkDatabase: async () => undefined,
    loginRateLimit: { windowMs: 60_000, limit: 5 },
    referenceRepository: fakeReferenceRepository(),
    employeeService: createEmployeeService({
      employeeRepository,
      referenceRepository: fakeReferenceRepository(),
      clock: fixedClock('2026-10-13T09:00:00Z'),
      transaction: employeeRepository.transaction,
    }),
    insightsRepository: emptyInsightsRepository(),
    ...overrides,
  };
}

export function buildTestApp(overrides: Partial<AppDeps> = {}) {
  return createApp(testDeps(overrides));
}
