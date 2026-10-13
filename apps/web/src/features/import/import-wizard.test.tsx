import type { ImportResult } from '@acme/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, stubFetch } from '@/test/fetch';
import { renderWithProviders } from '@/test/render';
import { ImportWizard } from './components/import-wizard';

const csvFile = () =>
  new File(['full_name,email\nAsha Rao,asha@acme.test'], 'employees.csv', { type: 'text/csv' });

const result = (overrides: Partial<ImportResult> = {}): ImportResult => ({
  dryRun: true,
  totalRows: 3,
  toCreate: 1,
  toUpdate: 1,
  unchanged: 1,
  errors: [],
  ...overrides,
});

async function upload() {
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText('CSV file'), csvFile());
  await user.click(screen.getByRole('button', { name: 'Check file' }));
  return user;
}

describe('ImportWizard', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers a template with the expected headers', () => {
    stubFetch({});
    renderWithProviders(<ImportWizard />);
    expect(screen.getByRole('link', { name: /download template/i })).toHaveAttribute(
      'href',
      '/employee-import-template.csv',
    );
  });

  it('previews row errors and keeps Apply disabled while any exist', async () => {
    const { requests } = stubFetch({
      'POST /api/v1/employees/import': () =>
        jsonResponse({
          data: result({
            toCreate: 1,
            toUpdate: 0,
            unchanged: 0,
            errors: [
              { row: 3, field: 'currency', message: 'Currency must be JPY for JP' },
              { row: 5, field: 'salary', message: 'Amount must have at most 2 decimal places' },
            ],
          }),
        }),
    });
    renderWithProviders(<ImportWizard />);
    await upload();

    const table = await screen.findByRole('table', { name: 'Import errors' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      '3currencyCurrency must be JPY for JP',
      '5salaryAmount must have at most 2 decimal places',
    ]);
    expect(screen.getByRole('button', { name: 'Apply import' })).toBeDisabled();
    expect(screen.getByText(/nothing will be written/i)).toBeInTheDocument();
    expect(requests[0]?.url.searchParams.get('dryRun')).toBe('true');
  });

  it('applies a clean file and reports the result', async () => {
    const { requests } = stubFetch({
      'POST /api/v1/employees/import': ({ url }) =>
        jsonResponse({ data: result({ dryRun: url.searchParams.get('dryRun') === 'true' }) }),
    });
    renderWithProviders(<ImportWizard />);
    const user = await upload();

    expect(await screen.findByText('To create')).toBeInTheDocument();
    const apply = screen.getByRole('button', { name: 'Apply import' });
    await waitFor(() => expect(apply).toBeEnabled());
    await user.click(apply);

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Import applied: 1 created, 1 updated, 1 unchanged.',
    );
    expect(requests.map((request) => request.url.searchParams.get('dryRun'))).toEqual([
      'true',
      'false',
    ]);
  });

  it('shows file-level problems such as missing columns', async () => {
    stubFetch({
      'POST /api/v1/employees/import': () =>
        jsonResponse(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Missing required columns: job_title, country_code',
            },
          },
          400,
        ),
    });
    renderWithProviders(<ImportWizard />);
    await upload();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Missing required columns: job_title, country_code',
    );
  });
});
