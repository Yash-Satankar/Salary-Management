import { describe, expect, it } from 'vitest';
import { formatSalary, formatUsdApprox, majorInputValue, percentChange } from './money';

describe('web money formatting', () => {
  it('formats local salaries with the currency and its exact decimals', () => {
    expect(formatSalary({ amountMinor: 125_000_050, currency: 'INR' }, 2)).toBe('₹1,250,000.50');
    expect(formatSalary({ amountMinor: 8_500_000, currency: 'JPY' }, 0)).toBe('¥8,500,000');
    expect(formatSalary({ amountMinor: 6_000_000, currency: 'GBP' }, 2)).toBe('£60,000.00');
  });

  it('labels USD equivalents as approximate and rounds to whole dollars', () => {
    expect(formatUsdApprox({ amountMinor: 1_437_501, currency: 'USD' })).toBe('≈ $14,375');
  });

  it('turns minor units back into the major-unit text a user edits', () => {
    expect(majorInputValue(125_000_050, 2)).toBe('1250000.50');
    expect(majorInputValue(8_500_000, 0)).toBe('8500000');
  });

  it('computes the percentage change between two salaries in the same currency', () => {
    expect(percentChange(100_000, 110_000)).toBe('+10.0%');
    expect(percentChange(200_000, 190_000)).toBe('−5.0%');
  });
});
