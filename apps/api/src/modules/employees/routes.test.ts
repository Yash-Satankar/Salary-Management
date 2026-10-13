import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../lib/clock';
import { InMemoryEmployeeRepository } from '../../test/fakes/employees';
import { fakeReferenceRepository, JOB_TITLES } from '../../test/fakes/reference';
import { buildTestApp, SESSION_COOKIE } from '../../test/http/test-app';
import { createEmployeeService } from './service';

function setup() {
  const repository = new InMemoryEmployeeRepository();
  const employeeService = createEmployeeService({
    employeeRepository: repository,
    referenceRepository: fakeReferenceRepository(),
    clock: fixedClock('2026-10-13T09:00:00Z'),
    transaction: repository.transaction,
  });
  const app = buildTestApp({ employeeService });
  const as = (method: 'get' | 'post' | 'patch', path: string) =>
    request(app)[method](`/api/v1${path}`).set('Cookie', SESSION_COOKIE);
  return { repository, app, as };
}

const newHire = {
  fullName: 'Asha Rao',
  email: 'asha.rao@acme.test',
  jobTitleId: JOB_TITLES.engineer.id,
  countryCode: 'IN',
  salaryMinor: 250_000_000,
  employmentType: 'full_time',
  hireDate: '2024-04-01',
};

const FX = { asOf: '2026-10-01', source: 'Illustrative static reference rates (approximate)' };

describe('employees API', () => {
  it('requires a session on every employee route', async () => {
    const { app } = setup();
    for (const response of [
      await request(app).get('/api/v1/employees'),
      await request(app).get('/api/v1/employees/1'),
      await request(app).post('/api/v1/employees').send(newHire),
      await request(app).patch('/api/v1/employees/1').send({ fullName: 'X Y' }),
      await request(app).post('/api/v1/employees/1/terminate').send({ terminatedOn: '2026-01-01' }),
    ]) {
      expect(response.status).toBe(401);
    }
  });

  it('lists employees with pagination and FX metadata', async () => {
    const { as, repository } = setup();
    repository.seed({ email: 'a@acme.test' });
    const response = await as('get', '/employees?page=1&pageSize=10');
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta).toEqual({ page: 1, pageSize: 10, total: 1, totalPages: 1, fx: FX });
  });

  it('rejects an invalid list query with 400', async () => {
    const { as } = setup();
    const response = await as('get', '/employees?pageSize=500&sort=salary');
    expect(response.status).toBe(400);
    expect(Object.keys(response.body.error.details.fieldErrors).sort()).toEqual([
      'pageSize',
      'sort',
    ]);
  });

  it('creates an employee and returns 201 with the detail and FX metadata', async () => {
    const { as } = setup();
    const response = await as('post', '/employees').send(newHire);
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      employeeCode: 'EMP-000001',
      salary: { amountMinor: 250_000_000, currency: 'INR' },
      salaryHistory: [{ previous: null }],
    });
    expect(response.body.meta).toEqual({ fx: FX });
  });

  it('maps invalid input to field errors', async () => {
    const { as } = setup();
    const response = await as('post', '/employees').send({
      ...newHire,
      email: 'nope',
      currency: 'INR',
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.fieldErrors).toHaveProperty('email');
  });

  it('returns 409 for a duplicate email', async () => {
    const { as } = setup();
    await as('post', '/employees').send(newHire);
    const response = await as('post', '/employees').send({
      ...newHire,
      email: 'ASHA.RAO@acme.test',
    });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('returns the detail, 404 for an unknown id and 400 for a malformed id', async () => {
    const { as } = setup();
    await as('post', '/employees').send(newHire);
    expect((await as('get', '/employees/1')).body.data.fullName).toBe('Asha Rao');
    const missing = await as('get', '/employees/99');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    expect((await as('get', '/employees/abc')).status).toBe(400);
  });

  it('returns 422 when the country changes without a salary', async () => {
    const { as } = setup();
    await as('post', '/employees').send(newHire);
    const response = await as('patch', '/employees/1').send({ countryCode: 'JP' });
    expect(response.status).toBe(422);
    expect(response.body.error.details.fieldErrors).toHaveProperty('salaryMinor');
  });

  it('updates salary with a history entry', async () => {
    const { as } = setup();
    await as('post', '/employees').send(newHire);
    const response = await as('patch', '/employees/1').send({
      salaryMinor: 275_000_000,
      salaryChange: { reason: 'Promotion' },
    });
    expect(response.status).toBe(200);
    expect(response.body.data.salaryHistory[0]).toMatchObject({
      previous: { amountMinor: 250_000_000 },
      new: { amountMinor: 275_000_000 },
      reason: 'Promotion',
    });
  });

  it('terminates an employee, then rejects further edits with 409', async () => {
    const { as } = setup();
    await as('post', '/employees').send(newHire);
    const terminated = await as('post', '/employees/1/terminate').send({
      terminatedOn: '2026-09-30',
    });
    expect(terminated.status).toBe(200);
    expect(terminated.body.data.status).toBe('terminated');
    const edit = await as('patch', '/employees/1').send({ fullName: 'Asha Rao' });
    expect(edit.status).toBe(409);
  });

  it('returns 422 for a termination date in the future', async () => {
    const { as } = setup();
    await as('post', '/employees').send(newHire);
    const response = await as('post', '/employees/1/terminate').send({
      terminatedOn: '2027-01-01',
    });
    expect(response.status).toBe(422);
  });
});
