import { formatMoney, type MoneyDto, toMajorString } from '@acme/shared';

export { toMinor } from '@acme/shared';

/** One UI locale keeps a mixed-currency table readable; the currency symbol varies per row. */
const LOCALE = 'en-US';

export function formatSalary(money: MoneyDto, minorUnit: number): string {
  return formatMoney(money, minorUnit, LOCALE);
}

const usdWholeDollars = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** USD figures come from a static, dated FX table, so they are always shown as approximate. */
export function formatUsdApprox(money: MoneyDto): string {
  return `≈ ${usdWholeDollars.format(toMajorString(money.amountMinor, 2) as `${number}`)}`;
}

/** The value placed in a salary input when editing, e.g. 125000050 (INR) → "1250000.50". */
export function majorInputValue(amountMinor: number, minorUnit: number): string {
  return toMajorString(amountMinor, minorUnit);
}

/** Display-only ratio between two amounts in the same currency. */
export function percentChange(previousMinor: number, newMinor: number): string {
  const change = ((newMinor - previousMinor) / previousMinor) * 100;
  const sign = change >= 0 ? '+' : '−';
  return `${sign}${Math.abs(change).toFixed(1)}%`;
}
