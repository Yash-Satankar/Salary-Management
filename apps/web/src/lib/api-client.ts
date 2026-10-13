import { type ErrorCode, errorEnvelopeSchema } from '@acme/shared';
import type { ZodType } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Shared Zod schema the response must satisfy; omitted for 204 responses. */
  schema?: ZodType<T>;
  signal?: AbortSignal;
  /** Login itself answers 401 for bad credentials; that must not bounce back to /login. */
  redirectOnUnauthenticated?: boolean;
}

export interface ApiClient {
  request<T = undefined>(path: string, options?: RequestOptions<T>): Promise<T>;
}

export interface ApiClientDeps {
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  onUnauthenticated: () => void;
}

const API_PREFIX = '/api/v1';

export function apiUrl(path: string, query: Record<string, QueryValue> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const search = params.toString();
  return `${API_PREFIX}${path}${search ? `?${search}` : ''}`;
}

async function toApiError(response: Response): Promise<ApiError> {
  const parsed = errorEnvelopeSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    return new ApiError(
      response.status,
      'INTERNAL',
      'The server could not be reached. Please try again.',
    );
  }
  const { code, message, details } = parsed.data.error;
  return new ApiError(response.status, code, message, details);
}

/**
 * The browser only talks to the Next.js origin; `/api/*` is proxied to the Express API, so the
 * session cookie stays first-party and is sent automatically.
 */
export function createApiClient({ fetch, onUnauthenticated }: ApiClientDeps): ApiClient {
  return {
    async request(path, options = {}) {
      const { method = 'GET', body, query, schema, signal } = options;
      const headers = new Headers({ Accept: 'application/json' });
      const isForm = body instanceof FormData;
      if (body !== undefined && !isForm) {
        headers.set('Content-Type', 'application/json');
      }
      const response = await fetch(apiUrl(path, query), {
        method,
        headers,
        credentials: 'same-origin',
        signal,
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await toApiError(response);
        if (response.status === 401 && options.redirectOnUnauthenticated !== false) {
          onUnauthenticated();
        }
        throw error;
      }
      if (response.status === 204 || !schema) {
        return undefined as never;
      }
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) {
        throw new Error('Unexpected response from the server');
      }
      return parsed.data;
    },
  };
}

/** Field-level messages from a validation (400), conflict (409) or domain (422) error. */
export function fieldErrorsOf(error: unknown): Record<string, string[]> {
  if (!(error instanceof ApiError) || typeof error.details !== 'object' || error.details === null) {
    return {};
  }
  const fieldErrors = (error.details as { fieldErrors?: unknown }).fieldErrors;
  return typeof fieldErrors === 'object' && fieldErrors !== null
    ? (fieldErrors as Record<string, string[]>)
    : {};
}

export function redirectToLogin(): void {
  const next = `${window.location.pathname}${window.location.search}`;
  // A full navigation (not router.push) runs outside React and also drops cached salary data.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

export const apiClient = createApiClient({
  fetch: (input, init) => fetch(input, init),
  onUnauthenticated: redirectToLogin,
});
