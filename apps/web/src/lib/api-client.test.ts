import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError, createApiClient, fieldErrorsOf } from './api-client';

interface Call {
  url: string;
  init: RequestInit;
}

/** Fake fetch at the network boundary: records calls and replays canned responses. */
function fakeFetch(...responses: Response[]) {
  const calls: Call[] = [];
  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    const response = responses.shift();
    if (!response) {
      throw new Error('No canned response left');
    }
    return response;
  };
  return { calls, fetch };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function setup(...responses: Response[]) {
  const { calls, fetch } = fakeFetch(...responses);
  let redirects = 0;
  const client = createApiClient({ fetch, onUnauthenticated: () => (redirects += 1) });
  return { client, calls, redirects: () => redirects };
}

const itemSchema = z.object({ data: z.object({ email: z.string() }) });

describe('api client', () => {
  it('prefixes the API path, serialises the query and validates the response', async () => {
    const { client, calls } = setup(json({ data: { email: 'hr@acme.test' } }));
    const result = await client.request('/employees', {
      query: { page: 2, search: 'rao', country: undefined, status: '' },
      schema: itemSchema,
    });
    expect(result).toEqual({ data: { email: 'hr@acme.test' } });
    expect(calls[0]?.url).toBe('/api/v1/employees?page=2&search=rao');
    expect(calls[0]?.init.credentials).toBe('same-origin');
  });

  it('sends JSON bodies with a JSON content type', async () => {
    const { client, calls } = setup(new Response(null, { status: 204 }));
    await expect(
      client.request('/auth/login', { method: 'POST', body: { email: 'a@b.c' } }),
    ).resolves.toBeUndefined();
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.body).toBe('{"email":"a@b.c"}');
    expect(new Headers(calls[0]?.init.headers).get('Content-Type')).toBe('application/json');
  });

  it('sends FormData uploads without overriding the multipart content type', async () => {
    const { client, calls } = setup(json({ data: { email: 'x' } }));
    const form = new FormData();
    form.append('file', new Blob(['a,b']), 'employees.csv');
    await client.request('/employees/import', { method: 'POST', body: form, schema: itemSchema });
    expect(calls[0]?.init.body).toBe(form);
    expect(new Headers(calls[0]?.init.headers).has('Content-Type')).toBe(false);
  });

  it('turns the error envelope into an ApiError with field errors', async () => {
    const { client } = setup(
      json(
        {
          error: {
            code: 'CONFLICT',
            message: 'An employee with this email already exists',
            details: { formErrors: [], fieldErrors: { email: ['Already used'] } },
          },
        },
        409,
      ),
    );
    const error = await client.request('/employees', { method: 'POST', body: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'CONFLICT' });
    expect(error.message).toBe('An employee with this email already exists');
    expect(fieldErrorsOf(error)).toEqual({ email: ['Already used'] });
  });

  it('redirects to the login page on 401', async () => {
    const { client, redirects } = setup(
      json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } }, 401),
    );
    await expect(client.request('/employees')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(redirects()).toBe(1);
  });

  it('does not redirect when a login attempt itself is rejected', async () => {
    const { client, redirects } = setup(
      json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid email or password' } }, 401),
    );
    await expect(
      client.request('/auth/login', { method: 'POST', body: {}, redirectOnUnauthenticated: false }),
    ).rejects.toMatchObject({ message: 'Invalid email or password' });
    expect(redirects()).toBe(0);
  });

  it('reports a non-JSON failure (e.g. a proxy error page) generically', async () => {
    const { client } = setup(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(client.request('/employees')).rejects.toMatchObject({
      status: 502,
      code: 'INTERNAL',
      message: 'The server could not be reached. Please try again.',
    });
  });

  it('rejects a success response that does not match the expected schema', async () => {
    const { client } = setup(json({ data: { unexpected: true } }));
    await expect(client.request('/auth/me', { schema: itemSchema })).rejects.toThrow(
      'Unexpected response from the server',
    );
  });
});

describe('fieldErrorsOf', () => {
  it('returns an empty object for errors without field details', () => {
    expect(fieldErrorsOf(new Error('boom'))).toEqual({});
    expect(fieldErrorsOf(new ApiError(400, 'VALIDATION_ERROR', 'bad', 'not-an-object'))).toEqual(
      {},
    );
  });
});
