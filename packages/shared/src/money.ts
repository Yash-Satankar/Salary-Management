export class InvalidAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAmountError';
  }
}

const DECIMAL_PATTERN = /^(\d+)(?:\.(\d+))?$/;

interface DecimalParts {
  whole: string;
  fraction: string;
}

/** Splits a plain non-negative decimal; signs, exponents and digit separators are rejected. */
function parseDecimal(text: string, description: string): DecimalParts {
  const match = DECIMAL_PATTERN.exec(text.trim());
  if (!match) {
    throw new InvalidAmountError(`"${text}" is not a valid ${description}`);
  }
  return { whole: match[1] ?? '', fraction: match[2] ?? '' };
}

/**
 * Converts a major-unit decimal string (e.g. "1250000.50") into integer minor units using exact
 * string arithmetic. `parseFloat` is never used because binary floats cannot represent most
 * decimal amounts exactly.
 */
export function toMinor(major: string, minorUnit: number): number {
  const { whole, fraction } = parseDecimal(major, 'non-negative amount');
  if (fraction.length > minorUnit) {
    throw new InvalidAmountError(
      minorUnit === 0
        ? 'Amount must not have decimal places for this currency'
        : `Amount must have at most ${minorUnit} decimal places`,
    );
  }
  const minor = BigInt(whole + fraction.padEnd(minorUnit, '0'));
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new InvalidAmountError('Amount is too large');
  }
  return Number(minor);
}

/** Renders integer minor units as a plain major-unit string, e.g. 125000050 (2) → "1250000.50". */
export function toMajorString(minor: number, minorUnit: number): string {
  if (!Number.isSafeInteger(minor)) {
    throw new InvalidAmountError(`${minor} is not an integer number of minor units`);
  }
  const sign = minor < 0 ? '-' : '';
  const digits = Math.abs(minor)
    .toString()
    .padStart(minorUnit + 1, '0');
  if (minorUnit === 0) {
    return sign + digits;
  }
  const splitAt = digits.length - minorUnit;
  return `${sign}${digits.slice(0, splitAt)}.${digits.slice(splitAt)}`;
}

export interface Money {
  amountMinor: number;
  currency: string;
}

export function formatMoney(money: Money, minorUnit: number, locale = 'en-US'): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
    minimumFractionDigits: minorUnit,
    maximumFractionDigits: minorUnit,
  });
  // Intl formats numeric strings as exact decimals, so large amounts never pass through a float.
  return formatter.format(toMajorString(money.amountMinor, minorUnit) as `${number}`);
}

/**
 * Converts local minor units to US cents with a decimal-string rate (USD per major unit), rounding
 * half up. Mirrors the SQL `salary_minor / 10^minor_unit * usd_per_unit * 100` so API and UI agree.
 */
export function toUsdMinor(amountMinor: number, minorUnit: number, usdPerUnit: string): number {
  const rate = parseDecimal(usdPerUnit, 'exchange rate');
  const numerator = BigInt(amountMinor) * BigInt(rate.whole + rate.fraction) * 100n;
  const denominator = 10n ** BigInt(minorUnit + rate.fraction.length);
  return Number(divideRoundingHalfUp(numerator, denominator));
}

function divideRoundingHalfUp(numerator: bigint, denominator: bigint): bigint {
  const sign = numerator < 0n ? -1n : 1n;
  const magnitude = numerator * sign;
  return sign * ((magnitude * 2n + denominator) / (denominator * 2n));
}
