import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../lib/clock';
import { InMemoryEmployeeRepository } from '../../test/fakes/employees';
import { fakeReferenceRepository } from '../../test/fakes/reference';
import { buildTestApp, SESSION_COOKIE, TEST_ORIGIN } from '../../test/http/test-app';
import { createEmployeeExporter } from './export';
import { createImportService } from './import-service';

const HEADER =
  'employee_code,full_name,email,department,job_title,country_code,currency,salary,employment_type,hire_date';
const ROW = ',Asha Rao,asha@acme.test,,Software Engineer,IN,INR,2500000.00,full_time,2021-04-01';

function setup() {
  const repository = new InMemoryEmployeeRepository();
  repository.seed({ fullName: '=cmd|calc', email: 'evil@acme.test' });
  const clock = fixedClock('2026-10-13T09:00:00Z');
  const referenceRepository = fakeReferenceRepository();
  const app = buildTestApp({
    importService: createImportService({
      employeeRepository: repository,
      referenceRepository,
      transaction: repository.transaction,
      clock,
    }),
    employeeExporter: createEmployeeExporter({
      employeeRepository: repository,
      referenceRepository,
      clock,
    }),
  });
  const upload = (query: string, content: string | Buffer) =>
    request(app)
      .post(`/api/v1/employees/import${query}`)
      .set('Cookie', SESSION_COOKIE)
      .attach('file', Buffer.isBuffer(content) ? content : Buffer.from(content), 'employees.csv');
  return { app, repository, upload };
}

describe('GET /api/v1/employees/export.csv', () => {
  it('requires a session', async () => {
    const { app } = setup();
    expect((await request(app).get('/api/v1/employees/export.csv')).status).toBe(401);
  });

  it('downloads a dated CSV attachment with escaped formulas', async () => {
    const { app } = setup();
    const response = await request(app)
      .get('/api/v1/employees/export.csv?status=all&sort=hireDate')
      .set('Cookie', SESSION_COOKIE);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/csv/);
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="employees-2026-10-13.csv"',
    );
    expect(response.text).toContain(`'=cmd|calc`);
  });

  it('validates filters like the list endpoint', async () => {
    const { app } = setup();
    const response = await request(app)
      .get('/api/v1/employees/export.csv?sort=nonsense')
      .set('Cookie', SESSION_COOKIE);
    expect(response.status).toBe(400);
  });
});

describe('POST /api/v1/employees/import', () => {
  it('dry-runs by default and reports the plan', async () => {
    const { upload, repository } = setup();
    const response = await upload('', `${HEADER}\n${ROW}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      dryRun: true,
      totalRows: 1,
      toCreate: 1,
      toUpdate: 0,
      unchanged: 0,
      errors: [],
    });
    expect(repository.employees).toHaveLength(1);
  });

  it('applies when dryRun=false', async () => {
    const { upload, repository } = setup();
    const response = await upload('?dryRun=false', `${HEADER}\n${ROW}`);
    expect(response.body.data.dryRun).toBe(false);
    expect(repository.employees).toHaveLength(2);
  });

  it('returns 200 with row errors for a file with bad rows', async () => {
    const { upload } = setup();
    const response = await upload('?dryRun=false', `${HEADER}\n${ROW.replace(',INR,', ',USD,')}`);
    expect(response.status).toBe(200);
    expect(response.body.data.errors).toEqual([
      { row: 2, field: 'currency', message: 'Currency must be INR for IN' },
    ]);
  });

  it('returns 400 for missing headers or a missing file', async () => {
    const { app, upload } = setup();
    const missingHeaders = await upload('', 'full_name\nAsha');
    expect(missingHeaders.status).toBe(400);
    expect(missingHeaders.body.error.message).toMatch(/Missing required columns/);

    const noFile = await request(app)
      .post('/api/v1/employees/import')
      .set('Cookie', SESSION_COOKIE)
      .field('note', 'no file here');
    expect(noFile.status).toBe(400);
    expect(noFile.body.error.message).toBe('Attach a CSV file in the "file" field');
  });

  it('returns 413 for files over 5 MB', async () => {
    const { upload } = setup();
    const response = await upload('', Buffer.alloc(5 * 1024 * 1024 + 1, 'a'));
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('only accepts multipart uploads from allowed origins', async () => {
    const { app } = setup();
    const json = await request(app)
      .post('/api/v1/employees/import')
      .set('Cookie', SESSION_COOKIE)
      .send({ csv: 'x' });
    expect(json.status).toBe(400);
    const foreign = await request(app)
      .post('/api/v1/employees/import')
      .set('Cookie', SESSION_COOKIE)
      .set('Origin', 'https://evil.example')
      .attach('file', Buffer.from(`${HEADER}\n${ROW}`), 'employees.csv');
    expect(foreign.status).toBe(403);
    const allowed = await request(app)
      .post('/api/v1/employees/import')
      .set('Cookie', SESSION_COOKIE)
      .set('Origin', TEST_ORIGIN)
      .attach('file', Buffer.from(`${HEADER}\n${ROW}`), 'employees.csv');
    expect(allowed.status).toBe(200);
  });
});
