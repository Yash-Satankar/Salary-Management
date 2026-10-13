import type { Db } from '../client';
import { resetEmployeeData } from '../reset';
import {
  generateSeedData,
  type SeedEmployee,
  type SeedOptions,
  type SeedReference,
} from './generate';

export const DEFAULT_SEED_OPTIONS: SeedOptions = {
  seed: 42,
  employeeCount: 10_000,
  referenceDate: '2026-10-01',
};

const BATCH_SIZE = 1_000;

export interface SeedResult {
  employees: number;
  salaryChanges: number;
}

/** Replaces all employee data with the deterministic data set, atomically. */
export async function seedDatabase(
  db: Db,
  options: SeedOptions = DEFAULT_SEED_OPTIONS,
): Promise<SeedResult> {
  const employees = generateSeedData(await loadReference(db), options);
  let salaryChanges = 0;

  await db.transaction().execute(async (trx) => {
    await resetEmployeeData(trx);
    for (const batch of chunk(employees, BATCH_SIZE)) {
      const inserted = await trx
        .insertInto('employees')
        .values(batch.map(toEmployeeRow))
        .returning(['id', 'email'])
        .execute();
      const idByEmail = new Map(inserted.map((row) => [row.email, row.id]));
      const historyRows = batch.flatMap((employee) =>
        employee.history.map((entry) => ({
          employee_id: idByEmail.get(employee.email) as number,
          previous_salary_minor: entry.previousSalaryMinor,
          previous_currency_code: entry.previousSalaryMinor === null ? null : employee.currencyCode,
          new_salary_minor: entry.newSalaryMinor,
          new_currency_code: employee.currencyCode,
          effective_date: entry.effectiveDate,
          reason: entry.reason,
        })),
      );
      for (const historyBatch of chunk(historyRows, BATCH_SIZE)) {
        await trx.insertInto('salary_changes').values(historyBatch).execute();
      }
      salaryChanges += historyRows.length;
    }
  });

  return { employees: employees.length, salaryChanges };
}

async function loadReference(db: Db): Promise<SeedReference> {
  const countries = await db
    .selectFrom('countries')
    .innerJoin('currencies', 'currencies.code', 'countries.currency_code')
    .innerJoin('fx_rates', 'fx_rates.currency_code', 'countries.currency_code')
    .select([
      'countries.code',
      'countries.currency_code as currencyCode',
      'currencies.minor_unit as minorUnit',
      'fx_rates.usd_per_unit as usdPerUnit',
    ])
    .orderBy('countries.code')
    .execute();
  const jobTitles = await db
    .selectFrom('job_titles')
    .select(['id', 'name'])
    .orderBy('id')
    .execute();
  return { countries, jobTitles };
}

function toEmployeeRow(employee: SeedEmployee) {
  return {
    full_name: employee.fullName,
    email: employee.email,
    job_title_id: employee.jobTitleId,
    country_code: employee.countryCode,
    currency_code: employee.currencyCode,
    salary_minor: employee.salaryMinor,
    employment_type: employee.employmentType,
    hire_date: employee.hireDate,
    status: employee.terminatedOn === null ? ('active' as const) : ('terminated' as const),
    terminated_on: employee.terminatedOn,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}
