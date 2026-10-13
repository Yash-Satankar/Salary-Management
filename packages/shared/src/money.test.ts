import { describe, expect, it } from 'vitest';
import { InvalidAmountError, toMajorString, toMinor } from './money';

describe('toMinor', () => {
  it('converts a two-decimal amount to minor units exactly', () => {
    expect(toMinor('1250000.50', 2)).toBe(125000050);
  });

  it('pads a single decimal digit', () => {
    expect(toMinor('10.5', 2)).toBe(1050);
  });

  it('accepts whole numbers for a two-decimal currency', () => {
    expect(toMinor('42', 2)).toBe(4200);
  });

  it('does not suffer from binary floating point error', () => {
    // parseFloat('0.29') * 100 === 28.999999999999996
    expect(toMinor('0.29', 2)).toBe(29);
    expect(toMinor('1.005', 3)).toBe(1005);
  });

  it('treats JPY (minor unit 0) amounts as whole yen', () => {
    expect(toMinor('8500000', 0)).toBe(8500000);
  });

  it('rejects any decimals for a zero-decimal currency', () => {
    expect(() => toMinor('8500000.5', 0)).toThrow(InvalidAmountError);
    expect(() => toMinor('8500000.0', 0)).toThrow(/decimal/);
  });

  it('rejects more decimals than the currency allows', () => {
    expect(() => toMinor('10.123', 2)).toThrow(/at most 2 decimal/);
  });

  it('trims surrounding whitespace', () => {
    expect(toMinor('  99.99 ', 2)).toBe(9999);
  });

  it('accepts zero (positivity is a domain rule, not a parsing rule)', () => {
    expect(toMinor('0', 2)).toBe(0);
  });

  it.each(['-10', '+10', '', ' ', 'abc', '1,000', '1e5', '10.', '.5', '1.2.3', '0x10', 'NaN'])(
    'rejects malformed amount %j',
    (input) => {
      expect(() => toMinor(input, 2)).toThrow(InvalidAmountError);
    },
  );

  it('rejects amounts beyond the safe integer range', () => {
    expect(() => toMinor('90071992547409.93', 2)).toThrow(/too large/);
  });
});

describe('toMajorString', () => {
  it('renders minor units with the currency decimals', () => {
    expect(toMajorString(125000050, 2)).toBe('1250000.50');
  });

  it('keeps trailing zeros so the value round-trips through CSV', () => {
    expect(toMajorString(4200, 2)).toBe('42.00');
  });

  it('pads amounts smaller than one major unit', () => {
    expect(toMajorString(5, 2)).toBe('0.05');
    expect(toMajorString(0, 2)).toBe('0.00');
  });

  it('renders JPY without a decimal point', () => {
    expect(toMajorString(8500000, 0)).toBe('8500000');
  });

  it('renders negative differences with a leading minus sign', () => {
    expect(toMajorString(-1050, 2)).toBe('-10.50');
  });

  it('round-trips with toMinor', () => {
    for (const [amount, unit] of [
      [1, 2],
      [999999999, 2],
      [8500000, 0],
      [1005, 3],
    ] as const) {
      expect(toMinor(toMajorString(amount, unit), unit)).toBe(amount);
    }
  });

  it('rejects non-integer minor amounts', () => {
    expect(() => toMajorString(10.5, 2)).toThrow(InvalidAmountError);
  });
});
