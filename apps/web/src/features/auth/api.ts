import { type LoginRequest, meResponseSchema } from '@acme/shared';
import { apiClient } from '@/lib/api-client';

export function login(credentials: LoginRequest): Promise<undefined> {
  return apiClient.request('/auth/login', {
    method: 'POST',
    body: credentials,
    redirectOnUnauthenticated: false,
  });
}

export function logout(): Promise<undefined> {
  return apiClient.request('/auth/logout', { method: 'POST', body: {} });
}

export async function fetchCurrentUser(): Promise<{ email: string }> {
  const { data } = await apiClient.request('/auth/me', { schema: meResponseSchema });
  return data;
}
