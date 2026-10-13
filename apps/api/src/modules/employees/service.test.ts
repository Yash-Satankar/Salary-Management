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
