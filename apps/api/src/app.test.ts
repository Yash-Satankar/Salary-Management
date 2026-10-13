import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp, SESSION_COOKIE } from './test/http/test-app';

describe('app skeleton', () => {
  it('reports health without authentication', async () => {
    const response = await request(buildTestApp()).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: 'ok', db: 'ok' } });
  });

  it('turns an unexpected failure into a 500 envelope without internals', async () => {
    const app = buildTestApp({
      checkDatabase: async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
      },
    });
    const response = await request(app).get('/api/v1/health');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { code: 'INTERNAL', message: 'Something went wrong' },
    });
    expect(JSON.stringify(response.body)).not.toContain('ECONNREFUSED');
  });

  it('returns 404 in the error envelope for unknown routes', async () => {
    const outside = await request(buildTestApp()).get('/nope');
    expect(outside.status).toBe(404);
    expect(outside.body.error.code).toBe('NOT_FOUND');

    const inside = await request(buildTestApp())
      .get('/api/v1/does-not-exist')
      .set('Cookie', SESSION_COOKIE);
    expect(inside.status).toBe(404);
    expect(inside.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route GET /api/v1/does-not-exist not found' },
    });
  });

  it('rejects malformed JSON with a validation error', async () => {
    const response = await request(buildTestApp())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects JSON bodies over 100 kb with 413', async () => {
    const response = await request(buildTestApp())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'hr@acme.test', password: 'x'.repeat(110_000) }));
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('sets security headers', async () => {
    const response = await request(buildTestApp()).get('/api/v1/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
