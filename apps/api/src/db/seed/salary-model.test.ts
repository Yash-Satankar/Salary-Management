import { describe, expect, it } from 'vitest';
import { createRng } from './random';
import {
  COUNTRY_FACTOR_PERCENT,
  generateSalaryMinor,
  MAX_NOISE_BASIS_POINTS,
  randomNoiseBasisPoints,
  US_BASE_SALARY_USD,
} from './salary-model';

const USD = { minorUnit: 2, usdPerUnit: '1' };
const INR = { minorUnit: 2, usdPerUnit: '0.0115' };
const GBP = { minorUnit: 2, usdPerUnit: '1.30' };
const JPY = { minorUnit: 0, usdPerUnit: '0.0067' };

describe('salary model', () => {
  it('defines a US base salary for every one of the 26 job titles', () => {
    expect(Object.keys(US_BASE_SALARY_USD)).toHaveLength(26);
    expect(Object.values(US_BASE_SALARY_USD).every((base) => base > 0)).toBe(true);
  });

  it('applies the SPEC country factors', () => {
    expect(COUNTRY_FACTOR_PERCENT).toEqual({
      US: 100,
      GB: 75,
      DE: 75,
      CA: 75,
      AU: 75,
      SG: 70,
      JP: 60,
      IN: 25,
    });
  });

  it('uses the US base directly for the US with no noise', () => {
    // 120,000 USD × 1.00 → 120,000.00 USD
    expect(generateSalaryMinor('Software Engineer', 'US', USD, 0)).toBe(12_000_000);
  });

  it('converts to local currency and rounds to the nearest 1,000', () => {
    // 120,000 × 0.25 = 30,000 USD ÷ 0.0115 = 2,608,695.65 INR → 2,609,000.00 INR
    expect(generateSalaryMinor('Software Engineer', 'IN', INR, 0)).toBe(260_900_000);
    // 120,000 × 0.75 = 90,000 USD ÷ 1.30 = 69,230.77 GBP → 69,000.00 GBP
    expect(generateSalaryMinor('Software Engineer', 'GB', GBP, 0)).toBe(6_900_000);
  });

  it('rounds JPY to the nearest 10,000 yen with no minor digits', () => {
    // 120,000 × 0.60 = 72,000 USD ÷ 0.0067 = 10,746,268.66 JPY → 10,750,000 JPY
    expect(generateSalaryMinor('Software Engineer', 'JP', JPY, 0)).toBe(10_750_000);
  });

  it('applies noise as a percentage of the base', () => {
    // ±15% of 120,000 USD
    expect(generateSalaryMinor('Software Engineer', 'US', USD, 1500)).toBe(13_800_000);
    expect(generateSalaryMinor('Software Engineer', 'US', USD, -1500)).toBe(10_200_000);
  });

  it('rounds half-way values up', () => {
    // 120,000 × (1 + 0.0125) = 121,500 USD → 122,000
    expect(generateSalaryMinor('Software Engineer', 'US', USD, 125)).toBe(12_200_000);
  });

  it('rejects an unknown title or out-of-range noise', () => {
    expect(() => generateSalaryMinor('Astronaut', 'US', USD, 0)).toThrow(/Astronaut/);
    expect(() => generateSalaryMinor('Software Engineer', 'US', USD, 1501)).toThrow(/noise/);
  });

  it('draws noise within ±15% and covers both directions', () => {
    const rng = createRng(42);
    const draws = Array.from({ length: 5000 }, () => randomNoiseBasisPoints(rng));
    expect(Math.min(...draws)).toBeGreaterThanOrEqual(-MAX_NOISE_BASIS_POINTS);
    expect(Math.max(...draws)).toBeLessThanOrEqual(MAX_NOISE_BASIS_POINTS);
    expect(Math.min(...draws)).toBeLessThan(-1400);
    expect(Math.max(...draws)).toBeGreaterThan(1400);
    expect(draws.every(Number.isInteger)).toBe(true);
  });

  it('is deterministic for the same seed', () => {
    const first = createRng(42);
    const second = createRng(42);
    const sequence = (rng: ReturnType<typeof createRng>) =>
      Array.from({ length: 20 }, () => randomNoiseBasisPoints(rng));
    expect(sequence(first)).toEqual(sequence(second));
    expect(sequence(createRng(7))).not.toEqual(sequence(createRng(42)));
  });
});
