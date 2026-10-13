export class InvalidAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAmountError';
  }
}

const DECIMAL_PATTERN = /^(\d+)(?:\.(\d+))?$/;

/**
 * Converts a major-unit decimal string (e.g. "1250000.50") into integer minor units using exact
 * string arithmetic. `parseFloat` is never used because binary floats cannot represent most
 * decimal amounts exactly.
 */
export function toMinor(major: string, minorUnit: number): number {
  const match = DECIMAL_PATTERN.exec(major.trim());
  if (!match) {
    throw new InvalidAmountError(`"${major}" is not a valid non-negative amount`);
  }
  const whole = match[1] ?? '';
  const fraction = match[2] ?? '';
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
