import { type DestinationStream, type Logger, pino } from 'pino';

/** Salary systems must never log credentials or session tokens. */
export const REDACTED_PATHS = [
  'password',
  '*.password',
  'cookie',
  'authorization',
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
];

export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino({ level, redact: { paths: REDACTED_PATHS, censor: '[redacted]' } }, destination);
}
