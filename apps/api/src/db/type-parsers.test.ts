import { describe, expect, it } from 'vitest';
import { parseBigintToSafeNumber, parseDateAsString } from './type-parsers';

describe('parseBigintToSafeNumber', () => {
  it('parses BIGINT text into a JS number', () => {
    expect(parseBigintToSafeNumber('125000050')).toBe(125000050);
  });

  it('parses the largest safe integer', () => {
    expect(parseBigintToSafeNumber('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('throws rather than silently losing precision', () => {
    expect(() => parseBigintToSafeNumber('9007199254740993')).toThrow(/safe integer/);
  });
});

describe('parseDateAsString', () => {
  it('keeps DATE values as YYYY-MM-DD strings so no timezone shift can occur', () => {
    expect(parseDateAsString('2026-10-01')).toBe('2026-10-01');
  });
});
