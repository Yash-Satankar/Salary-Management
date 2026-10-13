import { type EmployeeListQuery, employeeListQuerySchema } from '@acme/shared';
import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../../test/integration/test-database';
import { createEmployeeRepository, createEmployeeTransaction } from './repository';
import { DuplicateEmailError, type NewEmployee } from './types';

const testDb = useTestDatabase();
const repository = () => createEmployeeRepository(testDb.db);

async function titleId(name: string): Promise<number> {
  const row = await testDb.db
    .selectFrom('job_titles')
    .select('id')
    .where('name', '=', name)
    .executeTakeFirstOrThrow();
  return row.id;
}

async function departmentId(name: string): Promise<number> {
  const row = await testDb.db
    .selectFrom('departments')
    .select('id')
    .where('name', '=', name)
    .executeTakeFirstOrThrow();
  return row.id;
}

/**
 * Five employees whose USD order differs from their raw-amount order:
 *   Asha  IN ₹2,500,000.00 × 0.0115 = $28,750     (raw 250,000,000 — largest raw amount)
 *   Ben   US   $180,000.00 × 1      = $180,000    (raw  18,000,000)
 *   Chika JP   ¥9,000,000  × 0.0067 = $60,300     (raw   9,000,000)
 *   Dana  GB    £60,000.00 × 1.30   = $78,000     (raw   6,000,000)
 *   Erik  DE    €70,000.00 × 1.10   = $77,000     (raw   7,000,000, terminated)
 */
async function insertFixture() {
  const engineer = await titleId('Software Engineer');
  const manager = await titleId('Engineering Manager');
  const recruiter = await titleId('Recruiter');
  const rows: NewEmployee[] = [
    {
      fullName: 'Asha Rao',
      email: 'asha.rao@acme.test',
      jobTitleId: engineer,
      countryCode: 'IN',
      currencyCode: 'INR',
      salaryMinor: 250_000_000,
      employmentType: 'full_time',
      hireDate: '2021-04-01',
    },
    {
      fullName: 'Ben Carter',
      email: 'ben.carter@acme.test',
      jobTitleId: manager,
      countryCode: 'US',
      currencyCode: 'USD',
      salaryMinor: 18_000_000,
      employmentType: 'full_time',
      hireDate: '2019-06-15',
    },
    {
      fullName: 'Chika Tanaka',
      email: 'chika.tanaka@acme.test',
      jobTitleId: engineer,
      countryCode: 'JP',
      currencyCode: 'JPY',
      salaryMinor: 9_000_000,
      employmentType: 'part_time',
      hireDate: '2022-01-10',
    },
    {
      fullName: 'Dana Smith',
      email: 'dana.smith@acme.test',
      jobTitleId: recruiter,
      countryCode: 'GB',
      currencyCode: 'GBP',
      salaryMinor: 6_000_000,
      employmentType: 'contract',
      hireDate: '2020-03-01',
    },
    {
      fullName: 'Erik Weber',
      email: 'erik.weber@acme.test',
      jobTitleId: engineer,
      countryCode: 'DE',
      currencyCode: 'EUR',
      salaryMinor: 7_000_000,
      employmentType: 'full_time',
      hireDate: '2018-02-01',
    },
  ];
  const created = [];
  for (const row of rows) {
    created.push(await repository().insert(row));
  }
  const erik = created[4];
  if (erik) {
    await repository().update(erik.id, { status: 'terminated', terminatedOn: '2025-06-30' });
  }
  return created;
}

const query = (overrides: Partial<Record<keyof EmployeeListQuery, string>> = {}) =>
  employeeListQuerySchema.parse(overrides);

const names = async (overrides: Parameters<typeof query>[0] = {}) =>
  (await repository().list(query(overrides))).items.map((item) => item.fullName);

describe('employee repository: writes', () => {
  it('inserts an employee with a generated code and lower-cased email', async () => {
    const created = await repository().insert({
      fullName: 'Asha Rao',
      email: 'Asha.Rao@ACME.test',
      jobTitleId: await titleId('Software Engineer'),
      countryCode: 'IN',
      currencyCode: 'INR',
      salaryMinor: 250_000_000,
      employmentType: 'full_time',
      hireDate: '2021-04-01',
    });
    expect(created).toMatchObject({
      employeeCode: 'EMP-000001',
      email: 'asha.rao@acme.test',
      status: 'active',
      terminatedOn: null,
    });
    await expect(repository().findByEmail('ASHA.RAO@acme.test')).resolves.toMatchObject({
      id: created.id,
    });
  });

  it('raises DuplicateEmailError when the case-insensitive index rejects an email', async () => {
    const [asha, ben] = await insertFixture();
    await expect(
      repository().insert({
        fullName: 'Another Asha',
        email: 'ASHA.RAO@acme.test',
        jobTitleId: asha?.jobTitleId ?? 0,
        countryCode: 'IN',
        currencyCode: 'INR',
        salaryMinor: 1,
        employmentType: 'full_time',
        hireDate: '2021-04-01',
      }),
    ).rejects.toBeInstanceOf(DuplicateEmailError);
    await expect(
      repository().update(ben?.id ?? 0, { email: 'asha.rao@acme.test' }),
    ).rejects.toBeInstanceOf(DuplicateEmailError);
  });

  it('updates fields and bumps updated_at', async () => {
    const [asha] = await insertFixture();
    const before = await testDb.db
      .selectFrom('employees')
      .select('updated_at')
      .where('id', '=', asha?.id ?? 0)
      .executeTakeFirstOrThrow();
    const updated = await repository().update(asha?.id ?? 0, { fullName: 'Asha R. Rao' });
    const after = await testDb.db
      .selectFrom('employees')
      .select('updated_at')
      .where('id', '=', asha?.id ?? 0)
      .executeTakeFirstOrThrow();
    expect(updated.fullName).toBe('Asha R. Rao');
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
  });

  it('rolls back every write when the transaction work fails', async () => {
    const transaction = createEmployeeTransaction(testDb.db);
    await expect(
      transaction(async (repo) => {
        const employee = await repo.insert({
          fullName: 'Rolled Back',
          email: 'rolled.back@acme.test',
          jobTitleId: await titleId('Recruiter'),
          countryCode: 'US',
          currencyCode: 'USD',
          salaryMinor: 1_000_000,
          employmentType: 'full_time',
          hireDate: '2024-01-01',
        });
        await repo.insertSalaryChange({
          employeeId: employee.id,
          previousSalaryMinor: null,
          previousCurrencyCode: null,
          newSalaryMinor: 1_000_000,
          newCurrencyCode: 'USD',
          effectiveDate: '2024-01-01',
          reason: 'Initial salary',
        });
        throw new Error('fail after writing');
      }),
    ).rejects.toThrow('fail after writing');
    const counts = await testDb.db
      .selectFrom('employees')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow();
    const history = await testDb.db
      .selectFrom('salary_changes')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow();
    expect(counts.count).toBe(0);
    expect(history.count).toBe(0);
  });
});

describe('employee repository: detail', () => {
  it('returns the joined employee with USD salary and history newest first', async () => {
    const [asha] = await insertFixture();
    const id = asha?.id ?? 0;
    for (const [previous, next, effectiveDate] of [
      [null, 230_000_000, '2021-04-01'],
      [230_000_000, 250_000_000, '2023-04-01'],
    ] as const) {
      await repository().insertSalaryChange({
        employeeId: id,
        previousSalaryMinor: previous,
        previousCurrencyCode: previous === null ? null : 'INR',
        newSalaryMinor: next,
        newCurrencyCode: 'INR',
        effectiveDate,
        reason: previous === null ? 'Initial salary' : 'Annual review',
      });
    }

    const detail = await repository().getDetail(id);
    expect(detail).toMatchObject({
      id,
      employeeCode: 'EMP-000001',
      fullName: 'Asha Rao',
      jobTitle: { name: 'Software Engineer' },
      department: { name: 'Engineering' },
      country: { code: 'IN', name: 'India' },
      salary: { amountMinor: 250_000_000, currency: 'INR' },
      salaryUsd: { amountMinor: 2_875_000, currency: 'USD' },
      employmentType: 'full_time',
      hireDate: '2021-04-01',
      status: 'active',
      terminatedOn: null,
    });
    expect(detail?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(detail?.salaryHistory.map((entry) => entry.effectiveDate)).toEqual([
      '2023-04-01',
      '2021-04-01',
    ]);
    expect(detail?.salaryHistory[0]).toMatchObject({
      previous: { amountMinor: 230_000_000, currency: 'INR' },
      new: { amountMinor: 250_000_000, currency: 'INR' },
      reason: 'Annual review',
    });
    expect(detail?.salaryHistory[1]?.previous).toBeNull();
  });

  it('returns undefined for an unknown id', async () => {
    await expect(repository().getDetail(123)).resolves.toBeUndefined();
  });
});

describe('employee repository: list', () => {
  it('lists active employees by name by default, with USD salaries and a total', async () => {
    await insertFixture();
    const page = await repository().list(query());
    expect(page.total).toBe(4);
    expect(page.items.map((item) => item.fullName)).toEqual([
      'Asha Rao',
      'Ben Carter',
      'Chika Tanaka',
      'Dana Smith',
    ]);
    expect(page.items[2]).toMatchObject({
      salary: { amountMinor: 9_000_000, currency: 'JPY' },
      salaryUsd: { amountMinor: 6_030_000, currency: 'USD' },
      department: { name: 'Engineering' },
    });
  });

  it('filters by status', async () => {
    await insertFixture();
    expect(await names({ status: 'terminated' })).toEqual(['Erik Weber']);
    expect(await names({ status: 'all' })).toHaveLength(5);
  });

  it('searches names by substring, emails by prefix and employee codes', async () => {
    await insertFixture();
    expect(await names({ search: 'TANAK' })).toEqual(['Chika Tanaka']);
    expect(await names({ search: 'ben.car' })).toEqual(['Ben Carter']);
    expect(await names({ search: 'acme.test' })).toEqual([]);
    expect(await names({ search: 'emp-000004' })).toEqual(['Dana Smith']);
  });

  it('treats LIKE wildcards in the search as literal characters', async () => {
    await insertFixture();
    expect(await names({ search: '%' })).toEqual([]);
    expect(await names({ search: '_' })).toEqual([]);
  });

  it('filters by country, department, job title and employment type', async () => {
    await insertFixture();
    expect(await names({ country: 'JP' })).toEqual(['Chika Tanaka']);
    expect(await names({ departmentId: String(await departmentId('People')) })).toEqual([
      'Dana Smith',
    ]);
    expect(await names({ jobTitleId: String(await titleId('Software Engineer')) })).toEqual([
      'Asha Rao',
      'Chika Tanaka',
    ]);
    expect(await names({ employmentType: 'contract' })).toEqual(['Dana Smith']);
  });

  it('sorts by the USD-normalised salary, not the raw amount', async () => {
    await insertFixture();
    expect(await names({ sort: 'salaryUsd', order: 'desc' })).toEqual([
      'Ben Carter',
      'Dana Smith',
      'Chika Tanaka',
      'Asha Rao',
    ]);
  });

  it('sorts by hire date, country name and job title', async () => {
    await insertFixture();
    expect(await names({ sort: 'hireDate' })).toEqual([
      'Ben Carter',
      'Dana Smith',
      'Asha Rao',
      'Chika Tanaka',
    ]);
    // India, Japan, United Kingdom, United States
    expect(await names({ sort: 'country' })).toEqual([
      'Asha Rao',
      'Chika Tanaka',
      'Dana Smith',
      'Ben Carter',
    ]);
    expect(await names({ sort: 'jobTitle', order: 'desc' })).toEqual([
      'Chika Tanaka',
      'Asha Rao',
      'Dana Smith',
      'Ben Carter',
    ]);
  });

  it('breaks ties by id so pages are stable', async () => {
    await insertFixture();
    // Asha (id 1) and Chika (id 3) share a title; ascending id breaks the tie.
    expect(await names({ sort: 'jobTitle' })).toEqual([
      'Ben Carter',
      'Dana Smith',
      'Asha Rao',
      'Chika Tanaka',
    ]);
  });

  it('paginates with offset and reports the full total', async () => {
    await insertFixture();
    const page = await repository().list(query({ page: '2', pageSize: '3' }));
    expect(page.total).toBe(4);
    expect(page.items.map((item) => item.fullName)).toEqual(['Dana Smith']);
    const beyond = await repository().list(query({ page: '9', pageSize: '3' }));
    expect(beyond).toEqual({ items: [], total: 4 });
  });
});
