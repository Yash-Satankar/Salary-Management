import type { EmployeeCreateInput } from '@acme/shared';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/errors';
import { fixedClock } from '../../lib/clock';
import { InMemoryEmployeeRepository } from '../../test/fakes/employees';
import { fakeReferenceRepository, JOB_TITLES } from '../../test/fakes/reference';
import { createEmployeeService } from './service';

const TODAY = '2026-10-13';

function setup() {
  const repository = new InMemoryEmployeeRepository();
  const service = createEmployeeService({
    employeeRepository: repository,
    referenceRepository: fakeReferenceRepository(),
    clock: fixedClock(`${TODAY}T09:00:00Z`),
    transaction: repository.transaction,
  });
  return { repository, service };
}

const newHire: EmployeeCreateInput = {
  fullName: 'Asha Rao',
  email: 'asha.rao@acme.test',
  jobTitleId: JOB_TITLES.engineer.id,
  countryCode: 'IN',
  salaryMinor: 250_000_000,
  employmentType: 'full_time',
  hireDate: '2024-04-01',
};

/** Runs `action` and returns the AppError it raised, so tests can assert code and details. */
async function appErrorFrom(action: Promise<unknown>): Promise<AppError> {
  const error = await action.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof AppError)) {
    throw new Error(`Expected an AppError, got ${String(error)}`);
  }
  return error;
}

describe('employee service: create', () => {
  it('derives the currency from the country', async () => {
    const { service, repository } = setup();
    const created = await service.create({ ...newHire, countryCode: 'JP', salaryMinor: 9_000_000 });
    expect(created.salary).toEqual({ amountMinor: 9_000_000, currency: 'JPY' });
    expect(repository.employees[0]?.currencyCode).toBe('JPY');
  });

  it('derives the department from the job title', async () => {
    const { service } = setup();
    const created = await service.create({ ...newHire, jobTitleId: JOB_TITLES.recruiter.id });
    expect(created.department).toEqual({ id: 2, name: 'People' });
  });

  it('rejects an unknown country against the countryCode field', async () => {
    const { service, repository } = setup();
    const error = await appErrorFrom(service.create({ ...newHire, countryCode: 'XX' }));
    expect(error.code).toBe('UNPROCESSABLE');
    expect(error.details).toEqual({
      formErrors: [],
      fieldErrors: { countryCode: ['Unknown country'] },
    });
    expect(repository.employees).toHaveLength(0);
  });

  it('rejects an unknown job title against the jobTitleId field', async () => {
    const { service } = setup();
    const error = await appErrorFrom(service.create({ ...newHire, jobTitleId: 999 }));
    expect(error.code).toBe('UNPROCESSABLE');
    expect(error.details).toEqual({
      formErrors: [],
      fieldErrors: { jobTitleId: ['Unknown job title'] },
    });
  });
});

describe('employee service: salary bounds', () => {
  it('accepts a salary worth exactly 5,000,000 USD', async () => {
    const { service } = setup();
    const created = await service.create({
      ...newHire,
      countryCode: 'US',
      salaryMinor: 500_000_000,
    });
    expect(created.salaryUsd).toEqual({ amountMinor: 500_000_000, currency: 'USD' });
  });

  it('rejects a salary worth more than 5,000,000 USD', async () => {
    const { service, repository } = setup();
    const error = await appErrorFrom(
      service.create({ ...newHire, countryCode: 'US', salaryMinor: 500_000_001 }),
    );
    expect(error.code).toBe('UNPROCESSABLE');
    expect(error.details).toEqual({
      formErrors: [],
      fieldErrors: { salaryMinor: ['Salary must not exceed the equivalent of 5,000,000 USD'] },
    });
    expect(repository.employees).toHaveLength(0);
  });

  it('applies the limit to the USD equivalent of local currencies, including JPY', async () => {
    const { service } = setup();
    // ¥746,268,000 × 0.0067 ≈ $4,999,995.60 → allowed
    await expect(
      service.create({ ...newHire, countryCode: 'JP', salaryMinor: 746_268_000 }),
    ).resolves.toBeDefined();
    // ¥746,300,000 × 0.0067 ≈ $5,000,210 → rejected
    const error = await appErrorFrom(
      service.create({
        ...newHire,
        email: 'other@acme.test',
        countryCode: 'JP',
        salaryMinor: 746_300_000,
      }),
    );
    expect(error.code).toBe('UNPROCESSABLE');
  });

  it('allows INR salaries that are large in local units but within the USD limit', async () => {
    const { service } = setup();
    // ₹40,00,00,000.00 × 0.0115 = $4,600,000
    await expect(
      service.create({ ...newHire, countryCode: 'IN', salaryMinor: 40_000_000_000 }),
    ).resolves.toBeDefined();
  });
});

describe('employee service: unique email', () => {
  it('rejects a duplicate email regardless of case with 409', async () => {
    const { service, repository } = setup();
    repository.seed({ email: 'asha.rao@acme.test' });
    const error = await appErrorFrom(service.create({ ...newHire, email: 'asha.rao@acme.test' }));
    expect(error.code).toBe('CONFLICT');
    expect(error.details).toEqual({
      formErrors: [],
      fieldErrors: { email: ['An employee with this email already exists'] },
    });
    expect(repository.employees).toHaveLength(1);
  });

  it('maps a unique-index violation from a concurrent insert to 409', async () => {
    const { service, repository } = setup();
    repository.seed({ email: 'asha.rao@acme.test' });
    // Simulates another request inserting the same email between the check and the insert.
    repository.findByEmail = async () => undefined;
    const error = await appErrorFrom(service.create(newHire));
    expect(error.code).toBe('CONFLICT');
  });
});

describe('employee service: initial salary history', () => {
  it('writes an initial history row effective from the hire date', async () => {
    const { service, repository } = setup();
    const created = await service.create(newHire);
    expect(repository.salaryChanges).toEqual([
      {
        id: 1,
        employeeId: created.id,
        previousSalaryMinor: null,
        previousCurrencyCode: null,
        newSalaryMinor: 250_000_000,
        newCurrencyCode: 'INR',
        effectiveDate: '2024-04-01',
        reason: 'Initial salary',
      },
    ]);
    expect(created.salaryHistory).toHaveLength(1);
    expect(created.salaryHistory[0]?.previous).toBeNull();
  });

  it('creates nothing if the history row cannot be written', async () => {
    const { service, repository } = setup();
    repository.insertSalaryChange = async () => {
      throw new Error('disk full');
    };
    await expect(service.create(newHire)).rejects.toThrow('disk full');
    expect(repository.employees).toHaveLength(0);
  });
});

describe('employee service: update and salary history', () => {
  async function withEmployee() {
    const context = setup();
    const created = await context.service.create(newHire);
    return { ...context, id: created.id };
  }

  it('records a salary change effective today by default', async () => {
    const { service, repository, id } = await withEmployee();
    const updated = await service.update(id, { salaryMinor: 275_000_000 });
    expect(updated.salary).toEqual({ amountMinor: 275_000_000, currency: 'INR' });
    expect(repository.salaryChanges.at(-1)).toMatchObject({
      employeeId: id,
      previousSalaryMinor: 250_000_000,
      previousCurrencyCode: 'INR',
      newSalaryMinor: 275_000_000,
      newCurrencyCode: 'INR',
      effectiveDate: TODAY,
      reason: null,
    });
  });

  it('uses the given effective date and reason', async () => {
    const { service, repository, id } = await withEmployee();
    await service.update(id, {
      salaryMinor: 275_000_000,
      salaryChange: { effectiveDate: '2026-07-01', reason: 'Annual review' },
    });
    expect(repository.salaryChanges.at(-1)).toMatchObject({
      effectiveDate: '2026-07-01',
      reason: 'Annual review',
    });
  });

  it('writes no history row when the salary is unchanged', async () => {
    const { service, repository, id } = await withEmployee();
    const updated = await service.update(id, { salaryMinor: 250_000_000, fullName: 'Asha R. Rao' });
    expect(updated.fullName).toBe('Asha R. Rao');
    expect(repository.salaryChanges).toHaveLength(1);
  });

  it('updates non-salary fields without touching history', async () => {
    const { service, repository, id } = await withEmployee();
    const updated = await service.update(id, {
      jobTitleId: JOB_TITLES.manager.id,
      employmentType: 'part_time',
    });
    expect(updated.jobTitle.name).toBe('Engineering Manager');
    expect(updated.employmentType).toBe('part_time');
    expect(repository.salaryChanges).toHaveLength(1);
  });

  it('rejects a salary change effective before the hire date or in the future', async () => {
    const { service, id } = await withEmployee();
    for (const effectiveDate of ['2024-03-31', '2026-10-14']) {
      const error = await appErrorFrom(
        service.update(id, { salaryMinor: 275_000_000, salaryChange: { effectiveDate } }),
      );
      expect(error.code).toBe('UNPROCESSABLE');
      expect(error.details).toMatchObject({ fieldErrors: { effectiveDate: [expect.any(String)] } });
    }
  });

  it('applies the salary limit to updates', async () => {
    const { service, id } = await withEmployee();
    const error = await appErrorFrom(service.update(id, { salaryMinor: 50_000_000_000 }));
    expect(error.details).toMatchObject({ fieldErrors: { salaryMinor: [expect.any(String)] } });
  });

  it('rejects an email that belongs to another employee, but allows re-casing its own', async () => {
    const { service, repository, id } = await withEmployee();
    repository.seed({ email: 'taken@acme.test' });
    const error = await appErrorFrom(service.update(id, { email: 'taken@acme.test' }));
    expect(error.code).toBe('CONFLICT');
    await expect(service.update(id, { email: 'asha.rao@acme.test' })).resolves.toBeDefined();
  });

  it('rejects an unknown job title', async () => {
    const { service, id } = await withEmployee();
    const error = await appErrorFrom(service.update(id, { jobTitleId: 999 }));
    expect(error.code).toBe('UNPROCESSABLE');
  });

  it('returns 404 for an unknown employee', async () => {
    const { service } = setup();
    const error = await appErrorFrom(service.update(42, { fullName: 'Nobody Here' }));
    expect(error.code).toBe('NOT_FOUND');
  });
});

describe('employee service: country changes', () => {
  async function withIndianEmployee() {
    const context = setup();
    const created = await context.service.create(newHire);
    return { ...context, id: created.id };
  }

  it('rejects a country change without a new salary', async () => {
    const { service, repository, id } = await withIndianEmployee();
    const error = await appErrorFrom(service.update(id, { countryCode: 'JP' }));
    expect(error.code).toBe('UNPROCESSABLE');
    expect(error.status).toBe(422);
    expect(error.details).toEqual({
      formErrors: [],
      fieldErrors: {
        salaryMinor: ['Changing the country changes the currency: enter the salary in JPY'],
      },
    });
    expect(repository.employees[0]?.countryCode).toBe('IN');
  });

  it('switches currency and records the cross-currency change in history', async () => {
    const { service, repository, id } = await withIndianEmployee();
    const updated = await service.update(id, { countryCode: 'JP', salaryMinor: 4_500_000 });
    expect(updated.country).toEqual({ code: 'JP', name: 'Japan' });
    expect(updated.salary).toEqual({ amountMinor: 4_500_000, currency: 'JPY' });
    expect(repository.salaryChanges.at(-1)).toMatchObject({
      previousSalaryMinor: 250_000_000,
      previousCurrencyCode: 'INR',
      newSalaryMinor: 4_500_000,
      newCurrencyCode: 'JPY',
    });
  });

  it('treats re-sending the current country as no country change', async () => {
    const { service, id } = await withIndianEmployee();
    await expect(
      service.update(id, { countryCode: 'IN', fullName: 'Asha Rao' }),
    ).resolves.toMatchObject({ country: { code: 'IN' } });
  });
});
