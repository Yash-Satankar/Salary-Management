import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, stubFetch } from '@/test/fetch';
import { renderWithProviders } from '@/test/render';
import { LoginForm } from './components/login-form';

const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() };
let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => searchParams,
}));

async function signIn(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginForm', () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    router.replace.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows field errors instead of submitting an empty form', async () => {
    const { requests } = stubFetch({});
    renderWithProviders(<LoginForm />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Invalid email address')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('signs in and returns to the page that was requested', async () => {
    searchParams = new URLSearchParams({ next: '/insights?country=JP' });
    const { requests } = stubFetch({
      'POST /api/v1/auth/login': () => new Response(null, { status: 204 }),
    });
    renderWithProviders(<LoginForm />);
    await signIn('HR@acme.test', 'acme-demo-2026');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/insights?country=JP'));
    expect(requests[0]?.body).toEqual({ email: 'hr@acme.test', password: 'acme-demo-2026' });
  });

  it('never redirects to another site', async () => {
    searchParams = new URLSearchParams({ next: '//evil.example/phish' });
    stubFetch({ 'POST /api/v1/auth/login': () => new Response(null, { status: 204 }) });
    renderWithProviders(<LoginForm />);
    await signIn('hr@acme.test', 'acme-demo-2026');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/employees'));
  });

  it('shows the server message when the credentials are wrong', async () => {
    stubFetch({
      'POST /api/v1/auth/login': () =>
        jsonResponse(
          { error: { code: 'UNAUTHENTICATED', message: 'Invalid email or password' } },
          401,
        ),
    });
    renderWithProviders(<LoginForm />);
    await signIn('hr@acme.test', 'wrong');
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(router.replace).not.toHaveBeenCalled();
  });
});
