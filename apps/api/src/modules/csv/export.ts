import { type EmployeeListItem, toMajorString } from '@acme/shared';
import { stringify } from 'csv-stringify';
import { pipeline, Readable } from 'node:stream';
import { escapeFormula } from './formula-escape';

export const EXPORT_COLUMNS = [
  'employee_code',
  'full_name',
  'email',
  'department',
  'job_title',
  'country_code',
  'currency',
  'salary',
  'employment_type',
  'hire_date',
  'status',
  'terminated_on',
] as const;

/** Minor-unit exponent per currency code, e.g. { INR: 2, JPY: 0 }. */
export type MinorUnits = Readonly<Record<string, number>>;

export function exportFilename(today: string): string {
  return `employees-${today}.csv`;
}

export function toExportRecord(item: EmployeeListItem, minorUnits: MinorUnits): string[] {
  const minorUnit = minorUnits[item.salary.currency];
  if (minorUnit === undefined) {
    throw new Error(`Unknown currency ${item.salary.currency}`);
  }
  return [
    item.employeeCode,
    item.fullName,
    item.email,
    item.department.name,
    item.jobTitle.name,
    item.country.code,
    item.salary.currency,
    // Major units with the currency's exact decimals, e.g. 1250000.00 or JPY 8500000.
    toMajorString(item.salary.amountMinor, minorUnit),
    item.employmentType,
    item.hireDate,
    item.status,
    item.terminatedOn ?? '',
  ].map(escapeFormula);
}

/**
 * Streams employees as CSV. The UTF-8 BOM makes Excel detect the encoding, so names such as
 * "Müller" survive the export → edit in Excel → import round trip.
 */
export function createExportStream(
  items: AsyncIterable<EmployeeListItem>,
  minorUnits: MinorUnits,
): Readable {
  async function* records() {
    for await (const item of items) {
      yield toExportRecord(item, minorUnits);
    }
  }
  const stringifier = stringify({ header: true, columns: [...EXPORT_COLUMNS], bom: true });
  pipeline(Readable.from(records()), stringifier, () => undefined);
  return stringifier;
}
