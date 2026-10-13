import type { EmployeeListItem, ReferenceData } from '@acme/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type OnUrlUpdateFunction, withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, stubFetch } from '@/test/fetch';
import { renderWithProviders } from '@/test/render';
import { EmployeeList } from './components/employee-list';

const reference: ReferenceData = {
  countries: [
    { code: 'IN', name: 'India', currency: { code: 'INR', name: 'Indian Rupee', minorUnit: 2 } },
    { code: 'JP', name: 'Japan', currency: { code: 'JPY', name: 'Japanese Yen', minorUnit: 0 } },
  ],
  departments: [{ id: 1, name: 'Engineering' }],
  jobTitles: [{ id: 1, name: 'Software Engineer', departmentId: 1 }],
  fx: {
    asOf: '2026-10-01',
    source: 'Illustrative static reference rates (approximate)',
    rates: { INR: '0.0115', JPY: '0.0067' },
  },
};

const chika: EmployeeListItem = {
  id: 3,
  employeeCode: 'EMP-000003',
  fullName: 'Chika Tanaka',
  email: 'chika@acme.test',
  jobTitle: { id: 1, name: 'Software Engineer' },
  department: { id: 1, name: 'Engineering' },
  country: { code: 'JP', name: 'Japan' },
  salary: { amountMinor: 8_500_000, currency: 'JPY' },
  salaryUsd: { amountMinor: 5_695_000, currency: 'USD' },
  employmentType: 'full_time',
  hireDate: '2022-01-10',
  status: 'active',
  terminatedOn: null,
};

const listResponse = (items: EmployeeListItem[], total = items.length) => ({
  data: items,
  meta: {
    page: 1,
    pageSize: 25,
    total,
    totalPages: Math.ceil(total / 25),
    fx: { asOf: reference.fx.asOf, source: reference.fx.source },
  },
});

function renderList(searchParams = '') {
  const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();
  const Nuqs = withNuqsTestingAdapter({ searchParams, onUrlUpdate });
  renderWithProviders(
    <Nuqs>
      <EmployeeList />
    </Nuqs>,
  );
  return { lastUrl: () => onUrlUpdate.mock.calls.at(-1)?.[0].queryString ?? '' };
}

describe('EmployeeList', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows salaries in local currency with an approximate USD column and the total', async () => {
    stubFetch({
      'GET /api/v1/reference': () => jsonResponse({ data: reference }),
      'GET /api/v1/employees': () => jsonResponse(listResponse([chika], 1234)),
    });
    renderList();
    const row = (await screen.findByText('Chika Tanaka')).closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement);
    expect(cells.getByText('¥8,500,000')).toBeInTheDocument();
    expect(cells.getByText('≈ $56,950')).toBeInTheDocument();
    expect(cells.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText(/of 1,234/)).toBeInTheDocument();
    expect(screen.getByText(/approximate/i)).toHaveTextContent('2026-10-01');
  });

  it('sends the URL filters to the API and links the export to the same filters', async () => {
    const { requests } = stubFetch({
      'GET /api/v1/reference': () => jsonResponse({ data: reference }),
      'GET /api/v1/employees': () => jsonResponse(listResponse([chika])),
    });
    renderList('?country=JP&sort=salaryUsd&order=desc&page=2');
    await screen.findByText('Chika Tanaka');
    const listCall = requests.find((request) => request.url.pathname === '/api/v1/employees');
    expect(Object.fromEntries(listCall?.url.searchParams ?? [])).toEqual({
      page: '2',
      pageSize: '25',
      country: 'JP',
      status: 'active',
      sort: 'salaryUsd',
      order: 'desc',
    });
    expect(screen.getByRole('link', { name: /export csv/i })).toHaveAttribute(
      'href',
      '/api/v1/employees/export.csv?status=active&sort=salaryUsd&order=desc&country=JP',
    );
  });

  it('sorts by a column when its header is clicked, toggling the direction', async () => {
    stubFetch({
      'GET /api/v1/reference': () => jsonResponse({ data: reference }),
      'GET /api/v1/employees': () => jsonResponse(listResponse([chika])),
    });
    const { lastUrl } = renderList('?sort=hireDate');
    await screen.findByText('Chika Tanaka');
    await userEvent.setup().click(screen.getByRole('button', { name: /hire date/i }));
    await waitFor(() => expect(lastUrl()).toBe('?sort=hireDate&order=desc'));
  });

  it('shows an empty state when nothing matches', async () => {
    stubFetch({
      'GET /api/v1/reference': () => jsonResponse({ data: reference }),
      'GET /api/v1/employees': () => jsonResponse(listResponse([])),
    });
    renderList('?search=nobody');
    expect(await screen.findByText('No employees match these filters.')).toBeInTheDocument();
  });

  it('shows an error with a retry button', async () => {
    let attempts = 0;
    stubFetch({
      'GET /api/v1/reference': () => jsonResponse({ data: reference }),
      'GET /api/v1/employees': () => {
        attempts += 1;
        return attempts === 1
          ? jsonResponse({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, 500)
          : jsonResponse(listResponse([chika]));
      },
    });
    renderList();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Chika Tanaka')).toBeInTheDocument();
  });
});
