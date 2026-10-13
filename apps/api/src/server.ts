import { sql } from 'kysely';
import { createApp } from './app';
import { loadEnv } from './config/env';
import { createDatabase } from './db/client';
import { systemClock } from './lib/clock';
import { createLogger } from './lib/logger';
import { createAuthService } from './modules/auth/service';
import { createReferenceRepository } from './modules/reference/repository';

const env = loadEnv();
const logger = createLogger(env.LOG_LEVEL);
const db = createDatabase({ connectionString: env.DATABASE_URL });
const clock = systemClock;

const app = createApp({
  config: { allowedOrigins: env.ALLOWED_ORIGINS, isProduction: env.NODE_ENV === 'production' },
  logger,
  authService: createAuthService({
    hrEmail: env.HR_EMAIL,
    hrPasswordHash: env.HR_PASSWORD_HASH,
    sessionSecret: env.SESSION_SECRET,
    clock,
  }),
  checkDatabase: async () => {
    await sql`SELECT 1`.execute(db);
  },
  loginRateLimit: { windowMs: 60_000, limit: 5 },
  referenceRepository: createReferenceRepository(db),
});

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'API listening');
});

const SHUTDOWN_TIMEOUT_MS = 10_000;

function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutting down');
  // Stop accepting connections first, then release the pool once in-flight requests finish.
  server.close(async () => {
    await db.destroy();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
