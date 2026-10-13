import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  buildTestApp,
  SESSION_COOKIE,
  TEST_ORIGIN,
  testDeps,
  VALID_CREDENTIALS,
} from '../../test/http/test-app';

function sessionCookieFrom(response: request.Response): string {
  const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
  return cookies?.find((cookie) => cookie.startsWith('acme_session=')) ?? '';
}

describe('POST /api/v1/auth/login', () => {
  it('sets an httpOnly, SameSite=Lax session cookie and returns 204', async () => {
    const response = await request(buildTestApp())
      .post('/api/v1/auth/login')
      .send(VALID_CREDENTIALS);
    expect(response.status).toBe(204);
    const cookie = sessionCookieFrom(response);
    expect(cookie).toMatch(/^acme_session=valid-session-token;/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=28800/);
    expect(cookie).not.toMatch(/Secure/);
  });

  it('marks the cookie Secure in production', async () => {
    const app = buildTestApp({
      config: { ...testDeps().config, isProduction: true },
    });
    const response = await request(app).post('/api/v1/auth/login').send(VALID_CREDENTIALS);
    expect(sessionCookieFrom(response)).toMatch(/Secure/);
  });

  it('returns the same generic 401 for a wrong password and an unknown email', async () => {
    const app = buildTestApp();
    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ ...VALID_CREDENTIALS, password: 'nope' });
    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ ...VALID_CREDENTIALS, email: 'other@acme.test' });
    for (const response of [wrongPassword, unknownEmail]) {
      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: { code: 'UNAUTHENTICATED', message: 'Invalid email or password' },
      });
      expect(sessionCookieFrom(response)).toBe('');
    }
  });

  it('reports invalid input in the validation envelope', async () => {
    const response = await request(buildTestApp())
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: '' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(response.body.error.details.fieldErrors).sort()).toEqual([
      'email',
      'password',
    ]);
  });

  it('allows 5 attempts per minute per IP, then answers 429', async () => {
    const app = buildTestApp();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ ...VALID_CREDENTIALS, password: 'guess' });
      expect(response.status).toBe(401);
    }
    const blocked = await request(app).post('/api/v1/auth/login').send(VALID_CREDENTIALS);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('session-protected routes', () => {
  it('rejects requests without a session cookie with 401', async () => {
    const response = await request(buildTestApp()).get('/api/v1/auth/me');
    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
    });
  });

  it('rejects an invalid session token', async () => {
    const response = await request(buildTestApp())
      .get('/api/v1/auth/me')
      .set('Cookie', 'acme_session=forged');
    expect(response.status).toBe(401);
  });

  it('hides unknown API routes behind authentication', async () => {
    const response = await request(buildTestApp()).get('/api/v1/employees-secret');
    expect(response.status).toBe(401);
  });

  it('returns the signed-in user', async () => {
    const response = await request(buildTestApp())
      .get('/api/v1/auth/me')
      .set('Cookie', `theme=dark; ${SESSION_COOKIE}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { email: VALID_CREDENTIALS.email } });
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('clears the session cookie and returns 204', async () => {
    const response = await request(buildTestApp())
      .post('/api/v1/auth/logout')
      .set('Cookie', SESSION_COOKIE)
      .set('Content-Type', 'application/json');
    expect(response.status).toBe(204);
    expect(sessionCookieFrom(response)).toMatch(/^acme_session=;.*Expires=Thu, 01 Jan 1970/);
  });
});

describe('CSRF defences on mutating routes', () => {
  it('rejects a request from an origin that is not allowed', async () => {
    const response = await request(buildTestApp())
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send(VALID_CREDENTIALS);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('accepts an allowed origin and requests without an Origin header', async () => {
    const app = buildTestApp();
    const allowed = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send(VALID_CREDENTIALS);
    expect(allowed.status).toBe(204);
  });

  it('requires a JSON content type, which a cross-site HTML form cannot send', async () => {
    const response = await request(buildTestApp())
      .post('/api/v1/auth/login')
      .type('form')
      .send(VALID_CREDENTIALS);
    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Content-Type must be application/json',
    });
  });

  it('does not restrict safe methods', async () => {
    const response = await request(buildTestApp())
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example');
    expect(response.status).toBe(200);
  });
});
