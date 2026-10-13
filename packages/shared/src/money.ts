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
