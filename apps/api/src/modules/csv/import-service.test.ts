import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../lib/clock';
import { InMemoryEmployeeRepository } from '../../test/fakes/employees';
import { fakeReferenceRepository } from '../../test/fakes/reference';
import { ImportFileError } from './import-parser';
import { createImportService } from './import-service';

const HEADER =
  'employee_code,full_name,email,department,job_title,country_code,currency,salary,employment_type,hire_date';

function csv(...lines: string[]) {
  return [HEADER, ...lines].join('\n');
}

function setup() {
  const repository = new InMemoryEmployeeRepository();
  // EMP-000001: unchanged in the files below; EMP-000002: gets edited; EMP-000003: terminated.
  repository.seed({
    fullName: 'Asha Rao',
    email: 'asha.rao@acme.test',
    salaryMinor: 250_000_000,
    hireDate: '2021-04-01',
  });
  repository.seed({
    fullName: 'Ben Carter',
    email: 'ben.carter@acme.test',
    countryCode: 'US',
    currencyCode: 'USD',
    salaryMinor: 18_000_000,
    hireDate: '2019-06-15',
  });
  repository.seed({
    email: 'gone@acme.test',
    status: 'terminated',
    terminatedOn: '2025-01-01',
  });
  const service = createImportService({
    employeeRepository: repository,
    referenceRepository: fakeReferenceRepository(),
    transaction: repository.transaction,
    clock: fixedClock('2026-10-13T09:00:00Z'),
  });
  return { repository, service };
}

const unchangedAsha =
  'EMP-000001,Asha Rao,asha.rao@acme.test,Engineering,Software Engineer,IN,INR,2500000.00,full_time,2021-04-01';
const raisedBen =
  'EMP-000002,Ben Carter,ben.carter@acme.test,Engineering,Software Engineer,US,USD,190000.00,full_time,2019-06-15';
const newHire =
  ',Chika Tanaka,chika.tanaka@acme.test,Engineering,Software Engineer,JP,JPY,8500000,full_time,2022-01-10';

describe('import service: dry run', () => {
  it('plans creates, updates and unchanged rows without writing anything', async () => {
    const { service, repository } = setup();
    const result = await service.run(csv(unchangedAsha, raisedBen, newHire), { dryRun: true });
    expect(result).toEqual({
      dryRun: true,
      totalRows: 3,
      toCreate: 1,
      toUpdate: 1,
      unchanged: 1,
      errors: [],
    });
    expect(repository.employees).toHaveLength(3);
    expect(repository.salaryChanges).toHaveLength(0);
  });

  it('treats a re-cased email of the same employee as unchanged', async () => {
    const { service } = setup();
    const result = await service.run(csv(unchangedAsha.replace('asha.rao@', 'ASHA.RAO@')), {
      dryRun: true,
    });
    expect(result).toMatchObject({ unchanged: 1, errors: [] });
  });

  it('propagates file-level problems', async () => {
    const { service } = setup();
    await expect(service.run('full_name\nAsha', { dryRun: true })).rejects.toBeInstanceOf(
      ImportFileError,
    );
  });
});

describe('import service: database-level row errors', () => {
  it('reports unknown codes, terminated employees and emails owned by someone else', async () => {
    const { service } = setup();
    const result = await service.run(
      csv(
        unchangedAsha.replace('EMP-000001', 'EMP-999999'),
        'EMP-000003,Seeded Person,gone@acme.test,,Software Engineer,IN,INR,1.00,full_time,2022-01-10',
        newHire.replace('chika.tanaka@', 'ben.carter@'),
      ),
      { dryRun: true },
    );
    expect(result.errors).toEqual([
      { row: 2, field: 'employee_code', message: 'Unknown employee code EMP-999999' },
      { row: 3, field: 'employee_code', message: 'Terminated employees cannot be updated' },
      { row: 4, field: 'email', message: 'Email already belongs to EMP-000002' },
    ]);
  });

  it('accepts an unchanged terminated employee, so an export of all statuses re-imports cleanly', async () => {
    const { service } = setup();
    const result = await service.run(
      csv(
        'EMP-000003,Seeded Person,gone@acme.test,,Software Engineer,IN,INR,2500000.00,full_time,2022-01-10',
      ),
      { dryRun: true },
    );
    expect(result).toMatchObject({ unchanged: 1, toUpdate: 0, errors: [] });
  });

  it('combines parser errors and database errors, ordered by row', async () => {
    const { service } = setup();
    const result = await service.run(
      csv(
        newHire.replace('chika.tanaka@', 'ben.carter@'),
        unchangedAsha.replace(',IN,INR,', ',IN,JPY,'),
      ),
      { dryRun: true },
    );
    expect(result.errors.map((error) => [error.row, error.field])).toEqual([
      [2, 'email'],
      [3, 'currency'],
    ]);
  });
});

describe('import service: apply', () => {
  it('creates and updates employees with "CSV import" history rows', async () => {
    const { service, repository } = setup();
    const result = await service.run(csv(unchangedAsha, raisedBen, newHire), { dryRun: false });
    expect(result).toMatchObject({ dryRun: false, toCreate: 1, toUpdate: 1, unchanged: 1 });

    const chika = repository.employees.find(
      (employee) => employee.email === 'chika.tanaka@acme.test',
    );
    expect(chika).toMatchObject({ currencyCode: 'JPY', salaryMinor: 8_500_000 });
    expect(repository.employees.find((employee) => employee.id === 2)?.salaryMinor).toBe(
      19_000_000,
    );
    expect(repository.salaryChanges).toEqual([
      expect.objectContaining({
        employeeId: 2,
        previousSalaryMinor: 18_000_000,
        previousCurrencyCode: 'USD',
        newSalaryMinor: 19_000_000,
        newCurrencyCode: 'USD',
        effectiveDate: '2026-10-13',
        reason: 'CSV import',
      }),
      expect.objectContaining({
        employeeId: chika?.id,
        previousSalaryMinor: null,
        newSalaryMinor: 8_500_000,
        effectiveDate: '2022-01-10',
        reason: 'CSV import',
      }),
    ]);
  });

  it('updates other fields without a history row when the salary is unchanged', async () => {
    const { service, repository } = setup();
    await service.run(csv(unchangedAsha.replace('Asha Rao', 'Asha R. Rao')), { dryRun: false });
    expect(repository.employees[0]?.fullName).toBe('Asha R. Rao');
    expect(repository.salaryChanges).toHaveLength(0);
  });

  it('writes nothing when any row has an error', async () => {
    const { service, repository } = setup();
    const result = await service.run(
      csv(raisedBen, newHire, unchangedAsha.replace('2500000.00', 'lots')),
      { dryRun: false },
    );
    expect(result.errors).toEqual([
      { row: 4, field: 'salary', message: 'Salary must be a plain number such as 1250000.50' },
    ]);
    expect(repository.employees).toHaveLength(3);
    expect(repository.employees[1]?.salaryMinor).toBe(18_000_000);
    expect(repository.salaryChanges).toHaveLength(0);
  });

  it('rolls everything back if a write fails part-way through', async () => {
    const { service, repository } = setup();
    repository.insertSalaryChange = async () => {
      throw new Error('connection lost');
    };
    await expect(service.run(csv(raisedBen, newHire), { dryRun: false })).rejects.toThrow(
      'connection lost',
    );
    expect(repository.employees).toHaveLength(3);
    expect(repository.employees[1]?.salaryMinor).toBe(18_000_000);
  });
});
