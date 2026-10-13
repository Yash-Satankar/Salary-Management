import pg from 'pg';

const BIGINT_OID = 20;
const DATE_OID = 1082;

/** Money and ids are BIGINT; a value beyond 2^53 would be corrupted as a JS number, so fail loudly. */
export function parseBigintToSafeNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new RangeError(`BIGINT value ${value} is not a safe integer`);
  }
  return parsed;
}

/** pg's default turns DATE into a local-midnight Date, which shifts days across timezones. */
export function parseDateAsString(value: string): string {
  return value;
}

/** NUMERIC (FX rates) is intentionally left as a string and converted explicitly where used. */
export function registerTypeParsers(): void {
  pg.types.setTypeParser(BIGINT_OID, parseBigintToSafeNumber);
  pg.types.setTypeParser(DATE_OID, parseDateAsString);
}
