import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../test/integration/test-database';
import { migrateToLatest } from './migrator';

const testDb = useTestDatabase();

async function anyJobTitleId(): Promise<number> {
  const row = await testDb.db
    .selectFrom('job_titles')
    .select('id')
    .orderBy('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

async function insertEmployee(overrides: { email?: string; country?: string; currency?: string }) {
  return testDb.db
    .insertInto('employees')
    .values({
      full_name: 'Test Person',
      email: overrides.email ?? 'test.person@acme.test',
      job_title_id: await anyJobTitleId(),
      country_code: overrides.country ?? 'IN',
      currency_code: overrides.currency ?? 'INR',
      salary_minor: 100000000,
      employment_type: 'full_time',
      hire_date: '2024-01-15',
    })
    .returning(['id', 'employee_code'])
    .executeTakeFirstOrThrow();
}

describe('migrations', () => {
  it('apply cleanly and leave nothing pending on a re-run', async () => {
    await expect(migrateToLatest(testDb.db)).resolves.toEqual([]);
  });

  it('enable pg_trgm for name search', async () => {
    const result = await sql<{ extname: string }>`
      SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'
    `.execute(testDb.db);
    expect(result.rows).toHaveLength(1);
  });

  it('insert the 8 country/currency pairs, with JPY having no minor digits', async () => {
    const countries = await testDb.db
      .selectFrom('countries')
      .innerJoin('currencies', 'currencies.code', 'countries.currency_code')
      .select(['countries.code as country', 'currencies.code as currency', 'minor_unit'])
      .orderBy('countries.code')
      .execute();
    expect(countries).toEqual([
      { country: 'AU', currency: 'AUD', minor_unit: 2 },
      { country: 'CA', currency: 'CAD', minor_unit: 2 },
      { country: 'DE', currency: 'EUR', minor_unit: 2 },
      { country: 'GB', currency: 'GBP', minor_unit: 2 },
      { country: 'IN', currency: 'INR', minor_unit: 2 },
      { country: 'JP', currency: 'JPY', minor_unit: 0 },
      { country: 'SG', currency: 'SGD', minor_unit: 2 },
      { country: 'US', currency: 'USD', minor_unit: 2 },
    ]);
  });

  it('insert dated static FX rates as exact decimals', async () => {
    const rates = await testDb.db
      .selectFrom('fx_rates')
      .select(['currency_code', 'usd_per_unit', 'as_of'])
      .orderBy('currency_code')
      .execute();
    expect(rates).toHaveLength(8);
    expect(new Set(rates.map((rate) => rate.as_of))).toEqual(new Set(['2026-10-01']));
    expect(rates.find((rate) => rate.currency_code === 'INR')?.usd_per_unit).toBe('0.0115000000');
    expect(rates.find((rate) => rate.currency_code === 'JPY')?.usd_per_unit).toBe('0.0067000000');
  });

  it('insert departments with their job titles', async () => {
    const departments = await testDb.db.selectFrom('departments').select('name').execute();
    const titles = await testDb.db
      .selectFrom('job_titles')
      .innerJoin('departments', 'departments.id', 'job_titles.department_id')
      .select(['job_titles.name as title', 'departments.name as department'])
      .execute();
    expect(departments).toHaveLength(9);
    expect(titles).toHaveLength(25);
    expect(titles).toContainEqual({ title: 'Staff Engineer', department: 'Engineering' });
    expect(titles).toContainEqual({ title: 'Recruiter', department: 'People' });
  });
});

describe('employees table constraints', () => {
  it('generates sequential, zero-padded employee codes', async () => {
    const first = await insertEmployee({ email: 'a@acme.test' });
    const second = await insertEmployee({ email: 'b@acme.test' });
    expect(first.employee_code).toBe('EMP-000001');
    expect(second.employee_code).toBe('EMP-000002');
  });

  it('rejects a currency that does not belong to the country (composite FK)', async () => {
    await expect(insertEmployee({ country: 'IN', currency: 'JPY' })).rejects.toThrow(/foreign key/);
  });

  it('treats emails as unique regardless of case', async () => {
    await insertEmployee({ email: 'asha.rao@acme.test' });
    await expect(insertEmployee({ email: 'Asha.Rao@ACME.test' })).rejects.toThrow(
      /employees_email_lower_uq/,
    );
  });

  it('requires a termination date exactly when the status is terminated', async () => {
    const { id } = await insertEmployee({});
    await expect(
      testDb.db
        .updateTable('employees')
        .set({ status: 'terminated' })
        .where('id', '=', id)
        .execute(),
    ).rejects.toThrow(/check constraint/);
  });

  it('rejects a termination date before the hire date', async () => {
    const { id } = await insertEmployee({});
    await expect(
      testDb.db
        .updateTable('employees')
        .set({ status: 'terminated', terminated_on: '2023-12-31' })
        .where('id', '=', id)
        .execute(),
    ).rejects.toThrow(/check constraint/);
  });
});
