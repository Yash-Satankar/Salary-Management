import { employeeListQuerySchema } from '@acme/shared';
import { buffer } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';
import { seedDatabase } from '../../db/seed/seed';
import { fixedClock } from '../../lib/clock';
import { useTestDatabase } from '../../test/integration/test-database';
import { createEmployeeRepository, createEmployeeTransaction } from '../employees/repository';
import type { EmployeeTransaction } from '../employees/types';
import { createReferenceRepository } from '../reference/repository';
import { createExportStream } from './export';
import { createImportService } from './import-service';

const testDb = useTestDatabase();

function importService(transaction?: EmployeeTransaction) {
  return createImportService({
    employeeRepository: createEmployeeRepository(testDb.db),
    referenceRepository: createReferenceRepository(testDb.db),
    transaction: transaction ?? createEmployeeTransaction(testDb.db),
    clock: fixedClock('2026-10-13T09:00:00Z'),
  });
}

const MINOR_UNITS = { INR: 2, USD: 2, GBP: 2, EUR: 2, CAD: 2, AUD: 2, SGD: 2, JPY: 0 };

async function exportCsv(status: 'active' | 'all'): Promise<string> {
  const query = employeeListQuerySchema.parse({ status });
  const repository = createEmployeeRepository(testDb.db);
  const bytes = await buffer(createExportStream(repository.iterate(query), MINOR_UNITS));
  return bytes.toString('utf8');
}

const HEADER =
  'employee_code,full_name,email,department,job_title,country_code,currency,salary,employment_type,hire_date';

async function countRows() {
  const [employees, history] = await Promise.all([
    testDb.db
      .selectFrom('employees')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow(),
    testDb.db
      .selectFrom('salary_changes')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow(),
  ]);
  return { employees: employees.n, history: history.n };
}

describe('CSV import against Postgres', () => {
  it('round-trips an export of every status as all unchanged', async () => {
    await seedDatabase(testDb.db, { seed: 7, employeeCount: 300, referenceDate: '2026-10-01' });
    const result = await importService().run(await exportCsv('all'), { dryRun: true });
    expect(result).toEqual({
      dryRun: true,
      totalRows: 300,
      toCreate: 0,
      toUpdate: 0,
      unchanged: 300,
      errors: [],
    });
  });

  it('detects exactly one update when one salary is edited, and records it in history', async () => {
    await seedDatabase(testDb.db, { seed: 7, employeeCount: 50, referenceDate: '2026-10-01' });
    const lines = (await exportCsv('active')).split('\n');
    const header = lines[0] ?? '';
    const salaryColumn = header
      .replace(/^\uFEFF/, '')
      .split(',')
      .indexOf('salary');
    const edited = (lines[1] ?? '').split(',');
    const code = edited[0];
    edited[salaryColumn] = '123000';
    lines[1] = edited.join(',');

    const before = await countRows();
    const result = await importService().run(lines.join('\n'), { dryRun: false });
    expect(result).toMatchObject({ toCreate: 0, toUpdate: 1, errors: [] });

    const after = await countRows();
    expect(after).toEqual({ employees: before.employees, history: before.history + 1 });
    const change = await testDb.db
      .selectFrom('salary_changes')
      .innerJoin('employees', 'employees.id', 'salary_changes.employee_id')
      .select(['salary_changes.reason', 'salary_changes.effective_date', 'employees.salary_minor'])
      .where('employees.employee_code', '=', code ?? '')
      .orderBy('salary_changes.id', 'desc')
      .executeTakeFirstOrThrow();
    expect(change.reason).toBe('CSV import');
    expect(change.effective_date).toBe('2026-10-13');
  });

  it('writes nothing when one row is invalid, and reports its row and field', async () => {
    const before = await countRows();
    const result = await importService().run(
      [
        HEADER,
        ',Asha Rao,asha@acme.test,,Software Engineer,IN,INR,2500000.00,full_time,2021-04-01',
        ',Chika Tanaka,chika@acme.test,,Software Engineer,JP,JPY,8500000.50,full_time,2022-01-10',
      ].join('\n'),
      { dryRun: false },
    );
    expect(result.errors).toEqual([
      { row: 3, field: 'salary', message: 'Amount must not have decimal places for this currency' },
    ]);
    expect(await countRows()).toEqual(before);
  });

  it('rolls back the whole import when the database fails part-way through', async () => {
    let historyWrites = 0;
    const failingTransaction: EmployeeTransaction = (work) =>
      createEmployeeTransaction(testDb.db)((repository) =>
        work({
          ...repository,
          insertSalaryChange: async (change) => {
            historyWrites += 1;
            if (historyWrites === 2) {
              throw new Error('simulated failure on the second row');
            }
            await repository.insertSalaryChange(change);
          },
        }),
      );
    await expect(
      importService(failingTransaction).run(
        [
          HEADER,
          ',Asha Rao,asha@acme.test,,Software Engineer,IN,INR,2500000.00,full_time,2021-04-01',
          ',Ben Carter,ben@acme.test,,Software Engineer,US,USD,180000.00,full_time,2019-06-15',
        ].join('\n'),
        { dryRun: false },
      ),
    ).rejects.toThrow('simulated failure');
    expect(await countRows()).toEqual({ employees: 0, history: 0 });
  });
});
