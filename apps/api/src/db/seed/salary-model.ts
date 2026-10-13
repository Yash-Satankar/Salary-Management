import type { Rng } from './random';

/** Annual base salary in whole USD for each title in the US, before country factor and noise. */
export const US_BASE_SALARY_USD: Readonly<Record<string, number>> = {
  'Software Engineer': 120_000,
  'Senior Software Engineer': 155_000,
  'Staff Engineer': 195_000,
  'Engineering Manager': 185_000,
  'QA Engineer': 95_000,
  'DevOps Engineer': 130_000,
  'Product Manager': 140_000,
  'Senior Product Manager': 170_000,
  'Product Designer': 115_000,
  'Data Analyst': 90_000,
  'Data Scientist': 140_000,
  'Sales Development Rep': 65_000,
  'Account Executive': 110_000,
  'Sales Manager': 145_000,
  'Marketing Specialist': 75_000,
  'Marketing Manager': 120_000,
  'Support Specialist': 55_000,
  'Customer Success Manager': 85_000,
  Accountant: 70_000,
  'Financial Analyst': 85_000,
  'Finance Manager': 130_000,
  'HR Generalist': 70_000,
  Recruiter: 75_000,
  'HR Manager': 115_000,
  'Operations Analyst': 72_000,
  'Office Manager': 60_000,
};

/** Country pay level relative to the US, as integer percentages (SPEC §4). */
export const COUNTRY_FACTOR_PERCENT: Readonly<Record<string, number>> = {
  US: 100,
  GB: 75,
  DE: 75,
  CA: 75,
  AU: 75,
  SG: 70,
  JP: 60,
  IN: 25,
};

export const MAX_NOISE_BASIS_POINTS = 1500;

export interface CurrencyForModel {
  minorUnit: number;
  /** USD per major unit as a decimal string, e.g. "0.0115". */
  usdPerUnit: string;
}

export function randomNoiseBasisPoints(rng: Rng): number {
  return rng.int(-MAX_NOISE_BASIS_POINTS, MAX_NOISE_BASIS_POINTS);
}

/**
 * base × country factor × (1 + noise) → local currency → rounded to the nearest 1,000 major
 * units (10,000 for zero-decimal currencies such as JPY). All steps use integer arithmetic so the
 * result is identical on every platform.
 */
export function generateSalaryMinor(
  jobTitle: string,
  countryCode: string,
  currency: CurrencyForModel,
  noiseBasisPoints: number,
): number {
  const base = US_BASE_SALARY_USD[jobTitle];
  const factor = COUNTRY_FACTOR_PERCENT[countryCode];
  if (base === undefined || factor === undefined) {
    throw new Error(`No salary model for "${jobTitle}" in ${countryCode}`);
  }
  if (!Number.isInteger(noiseBasisPoints) || Math.abs(noiseBasisPoints) > MAX_NOISE_BASIS_POINTS) {
    throw new Error(`noise must be an integer within ±${MAX_NOISE_BASIS_POINTS} basis points`);
  }
  const [rateWhole = '0', rateFraction = ''] = currency.usdPerUnit.split('.');
  const rate = BigInt(rateWhole + rateFraction);
  const roundingStep = BigInt(roundingStepFor(currency.minorUnit));

  const numerator =
    BigInt(base) *
    BigInt(factor) *
    BigInt(10_000 + noiseBasisPoints) *
    10n ** BigInt(rateFraction.length);
  const denominator = 100n * 10_000n * rate * roundingStep;
  const steps = (numerator * 2n + denominator) / (denominator * 2n);
  return Number(steps * roundingStep * 10n ** BigInt(currency.minorUnit));
}

export function roundingStepFor(minorUnit: number): number {
  return minorUnit === 0 ? 10_000 : 1_000;
}
