import { toUsdMinor } from '@acme/shared';
import { addDays } from '../../lib/dates';

/**
 * Domain rules shared by the employee service and CSV import, so a rule cannot drift between
 * the form and the file path.
 */

export const MAX_SALARY_USD_MINOR = 5_000_000_00;
export const SALARY_LIMIT_MESSAGE = 'Salary must not exceed the equivalent of 5,000,000 USD';

/** Accepted offers can be entered up to this many days before the start date. */
export const MAX_DAYS_UNTIL_HIRE = 90;
export const HIRE_DATE_LIMIT_MESSAGE = `Hire date cannot be more than ${MAX_DAYS_UNTIL_HIRE} days ahead`;

export const INITIAL_SALARY_REASON = 'Initial salary';

/** The limit applies to the USD equivalent so one bound is meaningful in every currency. */
export function exceedsSalaryLimit(salaryMinor: number, minorUnit: number, usdPerUnit: string) {
  return toUsdMinor(salaryMinor, minorUnit, usdPerUnit) > MAX_SALARY_USD_MINOR;
}

export function isHireDateTooFarAhead(hireDate: string, today: string): boolean {
  return hireDate > addDays(today, MAX_DAYS_UNTIL_HIRE);
}
