import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../test/integration/test-database';
import { seedDatabase } from './seed';

const testDb = useTestDatabase();

/** Content checksum that ignores now()-based timestamps, which legitimately differ per run. */
async function checksum(): Promise<string> {
  const result = await sql<{ employees: string; history: string }>`
    SELECT
      (SELECT md5(string_agg(concat_ws('|', employee_code, full_name, email, job_title_id,
              country_code, currency_code, salary_minor, employment_type, hire_date, status,
              terminated_on), ',' ORDER BY employee_code)) FROM employees) AS employees,
      (SELECT md5(string_agg(concat_ws('|', e.employee_code, s.previous_salary_minor,
              s.previous_currency_code, s.new_salary_minor, s.new_currency_code,
              s.effective_date, s.reason), ',' ORDER BY s.id))
         FROM salary_changes s JOIN employees e ON e.id = s.employee_id) AS history
  `.execute(testDb.db);
  const row = result.rows[0];
  return `${row?.employees}:${row?.history}`;
}

describe('seedDatabase', () => {
  it('creates exactly 10,000 employees across 8 countries, identically on every run', async () => {
    const first = await seedDatabase(testDb.db);
    const firstChecksum = await checksum();
    const second = await seedDatabase(testDb.db);
    const secondChecksum = await checksum();

    expect(first.employees).toBe(10_000);
    expect(second).toEqual(first);
    expect(secondChecksum).toBe(firstChecksum);

    const stats = await testDb.db
      .selectFrom('employees')
      .select((eb) => [
        eb.fn.countAll<string>().as('employees'),
        eb.fn.count<string>('country_code').distinct().as('countries'),
        eb.fn.min('employee_code').as('firstCode'),
      ])
      .executeTakeFirstOrThrow();
    expect(stats).toEqual({ employees: '10000', countries: '8', firstCode: 'EMP-000001' });
  }, 60_000);

  it('ends every salary history at the employee current salary', async () => {
    await seedDatabase(testDb.db);
    const mismatches = await sql<{ count: string }>`
      SELECT count(*) AS count
      FROM employees e
      JOIN LATERAL (
        SELECT new_salary_minor, new_currency_code FROM salary_changes s
        WHERE s.employee_id = e.id ORDER BY effective_date DESC, id DESC LIMIT 1
      ) latest ON true
      WHERE latest.new_salary_minor <> e.salary_minor OR latest.new_currency_code <> e.currency_code
    `.execute(testDb.db);
    expect(mismatches.rows[0]?.count).toBe('0');
  }, 60_000);
});
