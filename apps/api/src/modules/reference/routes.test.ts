import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp, SESSION_COOKIE } from '../../test/http/test-app';

describe('GET /api/v1/reference', () => {
  it('requires a session', async () => {
    const response = await request(buildTestApp()).get('/api/v1/reference');
    expect(response.status).toBe(401);
  });

  it('returns countries, departments, job titles and FX rates', async () => {
    const response = await request(buildTestApp())
      .get('/api/v1/reference')
      .set('Cookie', SESSION_COOKIE);
    expect(response.status).toBe(200);
    expect(response.body.data.countries).toContainEqual({
      code: 'JP',
      name: 'Japan',
      currency: { code: 'JPY', name: 'Japanese Yen', minorUnit: 0 },
    });
    expect(response.body.data.jobTitles).toContainEqual({
      id: 3,
      name: 'Recruiter',
      departmentId: 2,
    });
    expect(response.body.data.fx).toMatchObject({ asOf: '2026-10-01', rates: { INR: '0.0115' } });
  });
});
