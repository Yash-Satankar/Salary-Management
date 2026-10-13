// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';

const request = (path: string, cookie?: string) =>
  new NextRequest(new URL(path, 'http://localhost:3000'), {
    headers: cookie ? { cookie } : {},
  });

describe('proxy (route guard)', () => {
  it('redirects to /login, remembering the requested page, when there is no session cookie', () => {
    const response = proxy(request('/employees?country=JP'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?next=%2Femployees%3Fcountry%3DJP',
    );
  });

  it('lets requests with a session cookie through; the API still verifies it', () => {
    const response = proxy(request('/insights', 'acme_session=some-token'));
    expect(response.headers.get('location')).toBeNull();
  });

  it('always allows the login page', () => {
    expect(proxy(request('/login')).headers.get('location')).toBeNull();
  });
});
