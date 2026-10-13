import type { EmployeeDetail, ReferenceData } from '@acme/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, stubFetch } from '@/test/fetch';
import { renderWithProviders } from '@/test/render';
import { EmployeeDetailView } from './components/employee-detail';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const reference: ReferenceData = {
  countries: [
    { code: 'IN', name: 'India', currency: { code: 'INR', name: 'Indian Rupee', minorUnit: 2 } },
    { code: 'JP', name: 'Japan', currency: { code: 'JPY', name: 'Japanese Yen', minorUnit: 0 } },
  ],
  departments: [{ id: 1, name: 'Engineering' }],
  jobTitles: [{ id: 1, name: 'Software Engineer', departmentId: 1 }],
  fx: { asOf: '2026-10-01', source: 'Static', rates: { INR: '0.0115', JPY: '0.0067' } },
};

const FX = { asOf: '2026-10-01', source: 'Static' };
const inr = (amountMinor: number) => ({ amountMinor, currency: 'INR' });

const chika: EmployeeDetail = {
  id: 7,
  employeeCode: 'EMP-000007',
  fullName: 'Chika Tanaka',
  email: 'chika@acme.test',
  jobTitle: { id: 1, name: 'Software Engineer' },
  department: { id: 1, name: 'Engineering' },
  country: { code: 'JP', name: 'Japan' },
  salary: { amountMinor: 9_000_000, currency: 'JPY' },
  salaryUsd: { amountMinor: 6_030_000, currency: 'USD' },
  employmentType: 'full_time',
  hireDate: '2021-04-01',
  status: 'active',
  terminatedOn: null,
  salaryHistory: [
    {
      id: 3,
      previous: inr(250_000_000),
      new: { amountMinor: 9_000_000, currency: 'JPY' },
      effectiveDate: '2025-01-01',
      reason: 'Relocation',
      createdAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 2,
      previous: inr(230_000_000),
      new: inr(250_000_000),
      effectiveDate: '2023-04-01',
      reason: 'Annual review',
      createdAt: '2023-04-01T00:00:00.000Z',
    },
    {
      id: 1,
      previous: null,
      new: inr(230_000_000),
      effectiveDate: '2021-04-01',
      reason: 'Initial salary',
      createdAt: '2021-04-01T00:00:00.000Z',
    },
  ],
  createdAt: '2021-04-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

function stubApi(employee: EmployeeDetail, onTerminate?: (body: unknown) => EmployeeDetail) {
  return stubFetch({
    'GET /api/v1/reference': () => jsonResponse({ data: reference }),
    'GET /api/v1/employees/7': () => jsonResponse({ data: employee, meta: { fx: FX } }),
    'POST /api/v1/employees/7/terminate': ({ body }) =>
      jsonResponse({ data: onTerminate?.(body) ?? employee, meta: { fx: FX } }),
  });
}

describe('EmployeeDetailView', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the salary history newest first with changes and reasons', async () => {
    stubApi(chika);
    renderWithProviders(<EmployeeDetailView id={7} />);
    const history = await screen.findByRole('list', { name: 'Salary history' });
    const entries = within(history).getAllByRole('listitem');
    expect(entries).toHaveLength(3);
    // A currency change cannot be expressed as a percentage.
    expect(entries[0]).toHaveTextContent('₹2,500,000.00 → ¥9,000,000');
    expect(entries[0]).not.toHaveTextContent('%');
    expect(entries[1]).toHaveTextContent('₹2,300,000.00 → ₹2,500,000.00');
    expect(entries[1]).toHaveTextContent('+8.7%');
    expect(entries[1]).toHaveTextContent('Annual review');
    expect(entries[2]).toHaveTextContent('Initial salary ₹2,300,000.00');
  });

  it('shows the current salary with an approximate USD figure', async () => {
    stubApi(chika);
    renderWithProviders(<EmployeeDetailView id={7} />);
    expect(await screen.findByText('¥9,000,000')).toBeInTheDocument();
    expect(screen.getByText('≈ $60,300')).toBeInTheDocument();
  });

  it('terminates after confirmation with the chosen date', async () => {
    const user = userEvent.setup();
    const { requests } = stubApi(chika, () => ({
      ...chika,
      status: 'terminated',
      terminatedOn: '2026-09-30',
    }));
    renderWithProviders(<EmployeeDetailView id={7} />);
    await user.click(await screen.findByRole('button', { name: 'Terminate' }));
    const dialog = await screen.findByRole('dialog');
    const dateInput = within(dialog).getByLabelText('Termination date');
    await user.clear(dateInput);
    await user.type(dateInput, '2026-09-30');
    await user.click(within(dialog).getByRole('button', { name: 'Terminate employee' }));
    await waitFor(() =>
      expect(requests.find((request) => request.method === 'POST')?.body).toEqual({
        terminatedOn: '2026-09-30',
      }),
    );
  });

  it('shows terminated employees read-only', async () => {
    stubApi({ ...chika, status: 'terminated', terminatedOn: '2025-12-31' });
    renderWithProviders(<EmployeeDetailView id={7} />);
    expect(await screen.findByText(/terminated on 2025-12-31/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Terminate' })).not.toBeInTheDocument();
  });
});
