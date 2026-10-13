import { vi } from 'vitest';

export interface RecordedRequest {
  method: string;
  url: URL;
  body: unknown;
}

type Handler = (request: RecordedRequest) => Response | Promise<Response>;

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Replaces global fetch with a router keyed by "METHOD /path" (no query string). Requests are
 * recorded so tests can assert on what the UI sent.
 */
export function stubFetch(routes: Record<string, Handler>) {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    const url = new URL(input, 'http://localhost');
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : (init.body ?? undefined);
    const request = { method, url, body };
    requests.push(request);
    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) {
      throw new Error(`Unexpected request ${method} ${url.pathname}`);
    }
    return handler(request);
  });
  return { requests };
}
