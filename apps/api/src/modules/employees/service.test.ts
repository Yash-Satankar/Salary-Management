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
